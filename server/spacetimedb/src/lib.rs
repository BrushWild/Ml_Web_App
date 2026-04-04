use spacetimedb::{Identity, ReducerContext, Table};

#[spacetimedb::table(accessor = users, public)]
#[derive(Clone)]
pub struct User {
    #[primary_key]
    pub identity: Identity,
    pub name: String,
}

#[spacetimedb::table(accessor = lobbies, public)]
#[derive(Clone)]
pub struct Lobby {
    #[primary_key]
    pub lobby_code: String,
    pub owner_id: Identity,
}

#[spacetimedb::table(accessor = players, public)]
#[derive(Clone)]
pub struct Player {
    #[primary_key]
    #[auto_inc]
    pub player_id: u64,
    pub lobby_code: String,
    pub client_id: Identity,
    pub name: String,
    pub score: i32,
}

#[spacetimedb::reducer]
pub fn update_user_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }

    let identity = ctx.sender();

    // Upsert User
    if let Some(_user) = ctx.db.users().identity().find(identity) {
        ctx.db.users().identity().update(User {
            identity,
            name: name.clone(),
        });
    } else {
        ctx.db.users().insert(User {
            identity,
            name: name.clone(),
        });
    }

    // Update name in any active player records
    for player in ctx.db.players().iter() {
        if player.client_id == identity {
            let mut updated_player = player.clone();
            updated_player.name = name.clone();
            ctx.db.players().player_id().update(updated_player);
        }
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn create_lobby(ctx: &ReducerContext, user_name: String) -> Result<(), String> {
    // 1. Update user name (upsert)
    update_user_name(ctx, user_name.clone())?;

    // 2. Generate a "random" 5-character string based on timestamp
    // Since reducers must be deterministic, we use the timestamp as a seed
    let seed = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    let code = generate_lobby_code(seed);

    // Ensure code is unique (highly likely given randomness + 1.1m combos, but we check)
    if ctx.db.lobbies().lobby_code().find(code.clone()).is_some() {
        return Err("Lobby code collision. Please try again.".to_string());
    }

    // 3. Insert Lobby
    ctx.db.lobbies().insert(Lobby {
        lobby_code: code.clone(),
        owner_id: ctx.sender(),
    });

    // 4. Add caller as first Player with score 0
    // Remove from any existing lobby first (as per join logic)
    remove_player_from_all_lobbies(ctx, ctx.sender());

    ctx.db.players().insert(Player {
        player_id: 0, // Auto-incremented
        lobby_code: code,
        client_id: ctx.sender(),
        name: user_name,
        score: 0,
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn join_lobby(ctx: &ReducerContext, code: String, name: String) -> Result<(), String> {
    // 1. Update user name
    update_user_name(ctx, name.clone())?;

    // 2. Validate lobby exists
    if ctx.db.lobbies().lobby_code().find(code.clone()).is_none() {
        return Err("Lobby not found".to_string());
    }

    // 3. Remove user from existing lobbies
    remove_player_from_all_lobbies(ctx, ctx.sender());

    // 4. Insert Player
    ctx.db.players().insert(Player {
        player_id: 0,
        lobby_code: code,
        client_id: ctx.sender(),
        name,
        score: 0,
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn update_score(ctx: &ReducerContext, player_id: u64, new_score: i32) -> Result<(), String> {
    let player = ctx.db.players().player_id().find(player_id)
        .ok_or("Player not found")?;

    let lobby = ctx.db.lobbies().lobby_code().find(player.lobby_code.clone())
        .ok_or("Lobby not found")?;

    // Permissions: only owner or the player themselves
    if player.client_id != ctx.sender() && lobby.owner_id != ctx.sender() {
        return Err("Permission denied".to_string());
    }

    let mut updated_player = player.clone();
    updated_player.score = new_score;
    ctx.db.players().player_id().update(updated_player);

    Ok(())
}

#[spacetimedb::reducer]
pub fn remove_player(ctx: &ReducerContext, player_id: u64) -> Result<(), String> {
    let player = ctx.db.players().player_id().find(player_id)
        .ok_or("Player not found")?;

    let lobby = ctx.db.lobbies().lobby_code().find(player.lobby_code.clone())
        .ok_or("Lobby not found")?;

    // Permissions: only owner can kick, or player can leave
    if player.client_id != ctx.sender() && lobby.owner_id != ctx.sender() {
        return Err("Permission denied".to_string());
    }

    perform_remove_player(ctx, player_id)?;

    Ok(())
}

// Helper functions (Internal)

fn generate_lobby_code(seed: u64) -> String {
    let charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O, I, 1, 0
    let mut code = String::with_capacity(5);
    let mut current_seed = seed;
    for _ in 0..5 {
        let idx = (current_seed % charset.len() as u64) as usize;
        code.push(charset.chars().nth(idx).unwrap());
        current_seed /= charset.len() as u64;
    }
    code
}

fn remove_player_from_all_lobbies(ctx: &ReducerContext, identity: Identity) {
    let players_to_remove: Vec<u64> = ctx.db.players().iter()
        .filter(|p| p.client_id == identity)
        .map(|p| p.player_id)
        .collect();

    for id in players_to_remove {
        let _ = perform_remove_player(ctx, id);
    }
}

fn perform_remove_player(ctx: &ReducerContext, player_id: u64) -> Result<(), String> {
    let player = ctx.db.players().player_id().find(player_id)
        .ok_or("Player not found")?;
    let lobby_code = player.lobby_code.clone();

    // Delete player record
    ctx.db.players().player_id().delete(player_id);

    // Check if lobby is empty or needs owner transfer
    let remaining_players: Vec<Player> = ctx.db.players().iter()
        .filter(|p| p.lobby_code == lobby_code)
        .collect();

    if remaining_players.is_empty() {
        // Cascade delete lobby
        if ctx.db.lobbies().lobby_code().find(lobby_code.clone()).is_some() {
            ctx.db.lobbies().lobby_code().delete(lobby_code);
        }
    } else {
        // If the removed player was the owner, transfer ownership
        if let Some(lobby) = ctx.db.lobbies().lobby_code().find(lobby_code.clone()) {
            if lobby.owner_id == player.client_id {
                // Find oldest player (lowest player_id)
                let mut oldest = &remaining_players[0];
                for p in &remaining_players {
                    if p.player_id < oldest.player_id {
                        oldest = p;
                    }
                }
                
                let mut updated_lobby = lobby.clone();
                updated_lobby.owner_id = oldest.client_id;
                ctx.db.lobbies().lobby_code().update(updated_lobby);
            }
        }
    }

    Ok(())
}

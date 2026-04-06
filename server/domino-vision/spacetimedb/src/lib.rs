use spacetimedb::{log, reducer, table, Identity, ReducerContext, Table};
use spacetimedb::rand::RngCore;

// --- Tables ---

#[table(accessor = user, public)]
pub struct User {
    #[primary_key]
    pub identity: Identity,
    pub name: String,
}

#[table(accessor = lobby, public)]
pub struct Lobby {
    #[primary_key]
    pub lobby_code: String,
    pub lobby_name: String,
    pub owner_id: Identity,
}

#[table(accessor = player, public)]
pub struct Player {
    #[primary_key]
    #[auto_inc]
    pub player_id: u64,
    #[index(btree)]
    pub lobby_code: String,
    pub client_id: Identity,
    pub name: String,
    pub score: i32,
}

// --- Reducers ---

#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    log::info!("Domino Vision SpacetimeDB Module Initialized.");
}

#[reducer(client_connected)]
pub fn client_connected(ctx: &ReducerContext) {
    let identity = ctx.sender();
    if ctx.db.user().identity().find(identity).is_none() {
        ctx.db.user().insert(User {
            identity,
            name: "Anonymous".to_string(),
        });
        log::info!("New user connected: {:?}", identity);
    } else {
        log::info!("User reconnected: {:?}", identity);
    }
}

#[reducer(client_disconnected)]
pub fn client_disconnected(_ctx: &ReducerContext) {
    // Currently no specific action needed on disconnect as per plan
}

#[reducer]
pub fn update_user_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Name cannot be empty".to_string());
    }

    let identity = ctx.sender();
    if let Some(user) = ctx.db.user().identity().find(identity) {
        ctx.db.user().identity().update(User {
            name: name.clone(),
            ..user
        });

        // Update all player records for this user in any lobbies
        for player in ctx.db.player().iter() {
            if player.client_id == identity {
                ctx.db.player().player_id().update(Player {
                    name: name.clone(),
                    ..player
                });
            }
        }
        Ok(())
    } else {
        Err("User not found".to_string())
    }
}

// FIXED: Swapped parameters to (name, code_arg) to match frontend
#[reducer]
pub fn create_lobby(ctx: &ReducerContext, user_name: String, lobby_name: String, code_arg: String) -> Result<(), String> {
    log::info!("create_lobby called with user_name: '{}', lobby_name: '{}', code_arg: '{}'", user_name, lobby_name, code_arg);
    
    if lobby_name.trim().is_empty() {
        return Err("Lobby name cannot be empty".to_string());
    }

    // Update user's name first
    update_user_name(ctx, user_name)?;

    // Generate a random 5-character string if code_arg is empty, otherwise use code_arg
    let lobby_code = if code_arg.trim().is_empty() {
        generate_random_code(ctx)
    } else {
        code_arg.trim().to_uppercase()
    };

    // Validate code is unique
    if ctx.db.lobby().lobby_code().find(&lobby_code).is_some() {
        return Err(format!("Lobby code {} already exists", lobby_code));
    }

    // Create the lobby
    ctx.db.lobby().insert(Lobby {
        lobby_code: lobby_code.clone(),
        lobby_name: lobby_name.trim().to_string(),
        owner_id: ctx.sender(),
    });

    // Add caller as the first player
    ctx.db.player().insert(Player {
        player_id: 0, // auto_inc
        lobby_code: lobby_code.clone(),
        client_id: ctx.sender(),
        name: ctx.db.user().identity().find(ctx.sender()).unwrap().name,
        score: 0,
    });

    log::info!("Lobby created: {} by {:?}", lobby_code, ctx.sender());
    Ok(())
}

// FIXED: Swapped parameters to (name, code) to match frontend
#[reducer]
pub fn join_lobby(ctx: &ReducerContext, name: String, code: String) -> Result<(), String> {
    let lobby_code = code.trim().to_uppercase();
    
    // Validate lobby exists
    if ctx.db.lobby().lobby_code().find(&lobby_code).is_none() {
        return Err(format!("Lobby {} does not exist", lobby_code));
    }

    // Update user's name
    update_user_name(ctx, name)?;

    // Remove user from any existing lobby
    leave_all_lobbies(ctx, ctx.sender())?;

    // Join the new lobby
    ctx.db.player().insert(Player {
        player_id: 0, // auto_inc
        lobby_code: lobby_code.clone(),
        client_id: ctx.sender(),
        name: ctx.db.user().identity().find(ctx.sender()).unwrap().name,
        score: 0,
    });

    log::info!("User {:?} joined lobby {}", ctx.sender(), lobby_code);
    Ok(())
}

#[reducer]
pub fn update_score(ctx: &ReducerContext, player_id: u64, new_score: i32) -> Result<(), String> {
    log::info!("update_score called with player_id: {}, new_score: {}", player_id, new_score);

    let player = ctx.db.player().player_id().find(&player_id)
        .ok_or_else(|| "Player not found".to_string())?;

    let lobby = ctx.db.lobby().lobby_code().find(&player.lobby_code)
        .ok_or_else(|| "Lobby not found".to_string())?;

    // Authorization: Only the player themselves or the lobby owner can modify a score
    if player.client_id != ctx.sender() && lobby.owner_id != ctx.sender() {
        return Err("Not authorized to update this score".to_string());
    }

    ctx.db.player().player_id().update(Player {
        score: new_score,
        ..player
    });

    Ok(())
}

#[reducer]
pub fn remove_player(ctx: &ReducerContext, player_id: u64) -> Result<(), String> {
    let player_to_remove = ctx.db.player().player_id().find(&player_id)
        .ok_or_else(|| "Player not found".to_string())?;

    let lobby_code = player_to_remove.lobby_code.clone();
    let lobby = ctx.db.lobby().lobby_code().find(&lobby_code)
        .ok_or_else(|| "Lobby not found".to_string())?;

    // Authorization: owner kicks someone or player leaves themselves
    if ctx.sender() != lobby.owner_id && ctx.sender() != player_to_remove.client_id {
        return Err("Not authorized to remove this player".to_string());
    }

    // Perform removal
    ctx.db.player().player_id().delete(&player_id);

    // Maintenance logic:
    // If the leaving player is the owner_id
    if player_to_remove.client_id == lobby.owner_id {
        // Find remaining players in this lobby
        let mut remaining_players: Vec<Player> = ctx.db.player().iter()
            .filter(|p| p.lobby_code == lobby_code)
            .collect();

        if remaining_players.is_empty() {
            // No players remain, delete the lobby
            ctx.db.lobby().lobby_code().delete(&lobby_code);
            log::info!("Lobby {} deleted as it is empty", lobby_code);
        } else {
            // Transfer ownership to the oldest player (lowest player_id)
            remaining_players.sort_by_key(|p| p.player_id);
            let next_owner = &remaining_players[0];
            ctx.db.lobby().lobby_code().update(Lobby {
                owner_id: next_owner.client_id,
                ..lobby
            });
            log::info!("Lobby {} ownership transferred to {:?}", lobby_code, next_owner.client_id);
        }
    } else {
        // Just verify if the lobby is now empty (if for some reason players are gone but not owner)
        // (Owner removal is handled above, so this is just a fallback for sanity)
        let is_empty = ctx.db.player().iter().filter(|p| p.lobby_code == lobby_code).count() == 0;
        if is_empty {
            ctx.db.lobby().lobby_code().delete(&lobby_code);
        }
    }

    Ok(())
}

// --- Internal Helpers (Not Reducers) ---

fn generate_random_code(ctx: &ReducerContext) -> String {
    let charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 'O', 'I', '1', '0' for clarity
    let mut code = String::with_capacity(5);
    for _ in 0..5 {
        let idx = (ctx.rng().next_u32() as usize) % charset.len();
        code.push(charset.chars().nth(idx).unwrap());
    }
    code
}

fn leave_all_lobbies(ctx: &ReducerContext, identity: Identity) -> Result<(), String> {
    let player_recs: Vec<u64> = ctx.db.player().iter()
        .filter(|p| p.client_id == identity)
        .map(|p| p.player_id)
        .collect();

    for id in player_recs {
        remove_player(ctx, id)?;
    }
    Ok(())
}
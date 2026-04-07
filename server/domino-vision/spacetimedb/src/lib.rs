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
pub fn client_disconnected(ctx: &ReducerContext) {
    if let Err(e) = leave_all_lobbies(ctx, ctx.sender()) {
        log::error!("Error cleaning up lobbies for disconnected client: {}", e);
    }
}

#[reducer]
pub fn update_user_name(ctx: &ReducerContext, name: String) -> Result<(), String> {
    log::info!("update_user_name called for {:?} with name: '{}'", ctx.sender(), name);
    if name.trim().is_empty() {
        log::error!("update_user_name failed: Name cannot be empty");
        return Err("Name cannot be empty".to_string());
    }

    let identity = ctx.sender();
    if let Some(user) = ctx.db.user().identity().find(identity) {
        ctx.db.user().identity().update(User {
            name: name.clone(),
            ..user
        });

        // Update all player records for this user in any lobbies
        let mut count = 0;
        for player in ctx.db.player().iter() {
            if player.client_id == identity {
                ctx.db.player().player_id().update(Player {
                    name: name.clone(),
                    ..player
                });
                count += 1;
            }
        }
        log::info!("update_user_name success for {:?}. Updated {} player records.", identity, count);
        Ok(())
    } else {
        log::error!("update_user_name failed: User not found for identity {:?}", identity);
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
    log::info!("join_lobby called: User '{}', Lobby '{}'", name, lobby_code);
    
    // Validate lobby exists
    if ctx.db.lobby().lobby_code().find(&lobby_code).is_none() {
        log::error!("join_lobby failed: Lobby {} does not exist", lobby_code);
        return Err(format!("Lobby {} does not exist", lobby_code));
    }

    // Update user's name
    update_user_name(ctx, name)?;

    // Remove user from any existing lobby
    leave_all_lobbies(ctx, ctx.sender())?;

    // Join the new lobby
    let player = ctx.db.player().insert(Player {
        player_id: 0, // auto_inc
        lobby_code: lobby_code.clone(),
        client_id: ctx.sender(),
        name: ctx.db.user().identity().find(ctx.sender()).unwrap().name,
        score: 0,
    });

    log::info!("join_lobby success: User {:?} joined lobby {}", player.player_id, lobby_code);
    Ok(())
}

#[reducer]
pub fn delete_lobby(ctx: &ReducerContext, code: String) -> Result<(), String> {
    log::info!("delete_lobby called with code: '{}'", code);
    let lobby_code = code.trim().to_uppercase();
    let lobby_opt = ctx.db.lobby().lobby_code().find(&lobby_code);  
    if lobby_opt.is_none() {
        log::error!("delete_lobby failed: Lobby {} does not exist", lobby_code);
        return Err(format!("Lobby {} does not exist", lobby_code));
    }
    let lobby = lobby_opt.unwrap();

    // Authorization: Only the owner can delete the entire lobby
    if ctx.sender() != lobby.owner_id {
        return Err("Not authorized to delete this lobby".to_string());
    }

    // 1. Remove all players in that lobby
    let players_to_remove: Vec<u64> = ctx.db.player().iter()
        .filter(|p| p.lobby_code == lobby_code)
        .map(|p| p.player_id)
        .collect();

    for player_id in players_to_remove {
        ctx.db.player().player_id().delete(&player_id);
    }

    // 2. Delete the lobby record
    ctx.db.lobby().lobby_code().delete(&lobby_code);

    log::info!("Lobby {} and all associated players deleted by owner {:?}", lobby_code, ctx.sender());
    Ok(())
}

#[reducer]
pub fn update_score(ctx: &ReducerContext, player_id: u64, new_score: i32) -> Result<(), String> {
    log::info!("update_score called with player_id: {}, new_score: {}", player_id, new_score);

    let player = ctx.db.player().player_id().find(&player_id)
        .ok_or_else(|| "Player not found".to_string())?;

    let lobby_opt = ctx.db.lobby().lobby_code().find(&player.lobby_code);
    if lobby_opt.is_none() {
        ctx.db.player().player_id().delete(&player_id);
        log::warn!("Player {} was orphaned in non-existent lobby {}", player_id, player.lobby_code);
        return Err("Lobby no longer exists".to_string());
    }
    let lobby = lobby_opt.unwrap();

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
    let lobby_opt = ctx.db.lobby().lobby_code().find(&lobby_code);

    if let Some(lobby) = lobby_opt {
        // Authorization check if lobby still exists
        if ctx.sender() != lobby.owner_id && ctx.sender() != player_to_remove.client_id {
            return Err("Not authorized to remove this player".to_string());
        }

        // Perform removal
        ctx.db.player().player_id().delete(&player_id);

        if player_to_remove.client_id == lobby.owner_id {
            // Find remaining players to transfer ownership
            let mut remaining_players: Vec<Player> = ctx.db.player().iter()
                .filter(|p| p.lobby_code == lobby_code)
                .collect();

            if remaining_players.is_empty() {
                // No one left, delete lobby
                ctx.db.lobby().lobby_code().delete(&lobby_code);
                log::info!("Lobby {} deleted as no players remain", lobby_code);
            } else {
                // Sort by player_id and pick the first remaining player as the new owner
                remaining_players.sort_by_key(|p| p.player_id);
                let next_owner = &remaining_players[0];
                
                ctx.db.lobby().lobby_code().update(Lobby {
                    owner_id: next_owner.client_id,
                    ..lobby
                });
                log::info!("Lobby {} ownership transferred to {:?}", lobby_code, next_owner.client_id);
            }
        } else {
            // Logic for a non-owner leaving: cleanup lobby if now empty
            let is_empty = ctx.db.player().iter().filter(|p| p.lobby_code == lobby_code).count() == 0;
            if is_empty {
                ctx.db.lobby().lobby_code().delete(&lobby_code);
                log::info!("Lobby {} deleted as it is now empty", lobby_code);
            }
        }
    } else {
        // Lobby is gone (orphaned state), just delete the player record
        ctx.db.player().player_id().delete(&player_id);
        log::info!("Cleaned up orphaned player {} from non-existent lobby {}", player_id, lobby_code);
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


var JoinOrCreateMatchRpc = "JoinOrCreateMatchRpc";
var LogicLoadedLoggerInfo = "Custom logic loaded.";
var MatchModuleName = "match";
type Context = nkruntime.Context;
type Logger = nkruntime.Logger;
type Nakama = nkruntime.Nakama
type Initializer = nkruntime.Initializer
type MatchState = nkruntime.MatchState
type Dispatcher = nkruntime.MatchDispatcher
type Presence = nkruntime.Presence
type MatchMessage = nkruntime.MatchMessage



interface Params { [key: string]: any }
function InitModule(ctx: Context, logger: Logger, nk: Nakama, initializer: Initializer) {
    initializer.registerRpc("addCoins", rpcAddCoins);
    initializer.registerRpc("updateBalance", rpcUpdateBalance);
    initializer.registerRpc("deductCoins", rpcDeductCoins);
    initializer.registerRpc("getCoins", getBalance);
    initializer.registerRpc("dailyReward", rpcClaimDailyReward);
    initializer.registerRpc("checkdailyReward", checkDailyRewards);
    initializer.registerRpc("savePlayerInfo", rpcSavePlayerInfo);
    initializer.registerRpc("getPlayerInfo", rpcGetPlayerInfo);
    initializer.registerRpc("generate_referral_code", generateReferralCode);
    initializer.registerRpc("validate_referral_code", validateReferralCode);
    initializer.registerRpc("create_leaderboard", createLeaderboard);
    initializer.registerRpc("write_score", writeScore);
    initializer.registerRpc("fetch_leaderboard", fetchLeaderboard);
    initializer.registerRpc("store_word", storeWord);
    initializer.registerRpc("fetch_words_list", fetchWordsList);
    initializer.registerRpc(JoinOrCreateMatchRpc, joinOrCreateMatch);
    initializer.registerMatch(MatchModuleName, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
    });
    logger.info(LogicLoadedLoggerInfo);
}
var joinOrCreateMatch = function (context: Context, logger: Logger, nakama: Nakama, payload: string) {
    var matches;
    var MatchesLimit = 4;
    var MinimumPlayers = 0;
    var label = { open: true, started: false };
    matches = nakama.matchList(MatchesLimit, true, JSON.stringify(label), MinimumPlayers, MaxPlayers);
    if (matches.length > 0)
        return matches[0].matchId;
    return nakama.matchCreate(MatchModuleName);
};
var MaxPlayers = 4;
var TickRate = 16;
var playerStateCollection = "playerStates";
//const TickRate = 1; // Add TickRate value

interface Player{
    positions: number[],
    displayName: string,
    presence: Presence
}

interface MatchLabel {
    open: boolean,
    started: boolean
}

interface GameState {
    players: Player[];
    playersWins: number[];
    roundDeclaredWins: number[][];
    roundDeclaredDraw: number[];
    actionHistory: Record<string, any>;
    killData: Record<string, any>;
    actionIndex: number;
    sortedPlayerIds: string[];
    matchLabel: MatchLabel;
    lastActionIndex: number,
    pendingDiceRoll: number| undefined
}



var matchInit = function (context: Context, logger: Logger, nakama: Nakama, params: Params) {
    var label: MatchLabel = { open: true, started: false };
    var gameState: GameState = {
        players: [],
        playersWins: [],
        roundDeclaredWins: [[]],
        roundDeclaredDraw: [],
        actionHistory: {},
        actionIndex: 0,
        sortedPlayerIds: [],
        matchLabel: label,
        lastActionIndex: 0,
        pendingDiceRoll: undefined,
        killData: {}
    };
    var labelString = JSON.stringify(label);
    logger.debug("Initializing match with label: %s", labelString);
    return {
        state: gameState,
        tickRate: 1,
        label: labelString,
    };
};
var matchJoinAttempt = function (ctx: Context, logger: Logger, nk: Nakama, dispatcher: Dispatcher, tick: number, state: MatchState, presence: Presence, metadata: Params) {
    var gameState = state;
    var label = gameState.matchLabel;
    if (label.started) {
        return {
            state: state,
            accept: false,
            rejectMessage: "Match has already started.",
        };
    }
    logger.debug("%q attempted to join Lobby match", ctx.userId);
    return {
        state: state,
        accept: true,
    };
};
var matchJoin = function (context: Context, logger: Logger, nakama: Nakama, dispatcher: Dispatcher, tick: number, state: MatchState, presences: Presence[]) {
    var gameState = state as GameState;
    var presencesOnMatch: Presence[] = [];
    gameState.players.forEach(function (player) {
        if (player)
            presencesOnMatch.push(player.presence);
    });
    var loop = function (presence: Presence) {
        var existingPlayers = gameState.players.filter(function (p) { return p.presence.userId === presence.userId; });
        var existingPlayer = existingPlayers.length > 0 ? existingPlayers[0] : undefined;
        var player = null;
        if (existingPlayer) {
            existingPlayer.presence = presence;
            player = existingPlayer; // Use existing player
        }
        else {
            var account = nakama.accountGetId(presence.userId);
            player = {
                positions: [0],
                presence: presence,
                displayName: account.user.displayName,
            };
            gameState.players.push(player);
        }
        dispatcher.broadcastMessage(1 /* OperationCode.PlayerJoined */, JSON.stringify(player), // Always use the `player` variable here
        presencesOnMatch);
        presencesOnMatch.push(presence);
    };
    for (var _i = 0, presences_1 = presences; _i < presences_1.length; _i++) {
        var presence = presences_1[_i];
        loop(presence);
    }
    gameState.sortedPlayerIds = gameState.players
        .map(function (player) { return player.presence.userId; })
        .sort();
    dispatcher.broadcastMessage(0 /* OperationCode.Players */, JSON.stringify(gameState.players), presences);
    return { state: gameState };
};
var matchLeave = function (ctx: Context, logger: Logger, nk: Nakama, dispatcher: Dispatcher, tick: number, state: MatchState, presences: Presence[]) {
    var gameState = state as GameState;
    presences.forEach(function (presence) {
        logger.debug("Player left: %v", presence.userId);
        // Remove player from state
        var index = gameState.players.findIndex(function (p) { return p.presence.userId === presence.userId; });
        if (index > -1) {
            gameState.players.splice(index, 1);
        }
    });
    if (gameState.players.length > 0) {
        // More than one player remains, continue the match
        return { state: gameState };
    }
    else {
        // Only one or no players left, consider ending the match
        logger.debug("Not enough players to continue the match.");
        return null;
    }
};
function findPlayerByUserId(players: Player[], userId: string) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].presence.userId === userId) {
            return players[i]; // Return the matching player immediately
        }
    }
    return undefined; // Return undefined if no player is found
}
function updateActionHistory(gameState: GameState, playerId: string, diceRoll: number, pieceIndex: number, move: number, logger: Logger, killedPieceInfo?: { pieceIndex: number }) {
    var actionIndex = gameState.actionIndex.toString();
    var nextPlayerId = determineNextPlayerId(gameState, playerId, diceRoll, killedPieceInfo);
    logger.debug("nextplyerid : " + diceRoll + " : " + nextPlayerId);
    if (!gameState.actionHistory[actionIndex]) {
        gameState.actionHistory[actionIndex] = {
            id: playerId,
            diceRoll: diceRoll,
            piece: {},
            nextPlayerId: nextPlayerId,
        };
    }
    gameState.actionHistory[actionIndex].nextPlayerId = nextPlayerId;
    if (gameState.actionHistory[actionIndex].piece[pieceIndex] === undefined) {
        gameState.actionHistory[actionIndex].piece[pieceIndex] = 0;
    }
    gameState.actionHistory[actionIndex].piece[pieceIndex] =
        gameState.actionHistory[actionIndex].piece[pieceIndex] + move + 1;
    if (killedPieceInfo) {
        // Use optional chaining to safely access the kills property
        gameState.actionHistory[actionIndex].kills =
            gameState.actionHistory[actionIndex].kills || {};
        gameState.actionHistory[actionIndex].kills[killedPieceInfo.pieceIndex] =
            -Infinity;
    }
    gameState.actionIndex++;
    gameState.lastActionIndex = parseInt(actionIndex);
    logger.debug("Updated action history at index ".concat(actionIndex, " for player ").concat(playerId, " on piece ").concat(pieceIndex.toString(), ": move by ").concat(move.toString()));
}
function matchLoop(context: Context, logger: Logger, nk: Nakama, dispatcher: Dispatcher, tick: number, state: MatchState, messages: MatchMessage[]) {
    var gameState = state as GameState;
    var label;
    if (!gameState.matchLabel) {
        logger.error("Match label is missing in the state.");
        return { state: state };
    }
    try {
        label = gameState.matchLabel; // Parse the match label
        logger.debug("Parsed match label in matchLoop: %s", JSON.stringify(label));
    }
    catch (error) {
        logger.error("Failed to parse match label in matchLoop: %v", error);
        return { state: state }; // Return the state without making any changes
    }
    if (!label.started &&
        gameState.actionHistory &&
        Object.keys(gameState.actionHistory).length > 0) {
        label.started = true;
        var labelString = JSON.stringify(label);
        dispatcher.matchLabelUpdate(labelString);
        logger.debug("Updated match label to: %s", labelString);
        gameState.matchLabel = label; // Ensure the updated label is in the gameState
        state.label = labelString; // Ensure the updated label is in the state
    }
    messages.forEach(function (message) {
        var msg = JSON.parse(nk.binaryToString(message.data));
        var player = findPlayerByUserId(gameState.players, message.sender.userId);
        if (!player) {
            logger.error("Player not found in game state.");
            return;
        }
        logger.debug("Received message:", msg);
        switch (message.opCode) {
            case 12 /* OperationCode.RequestSpecificActions */:
                var startActionIndex = msg.startActionIndex;
                logger.debug("startActionIndex : " + startActionIndex);
                var actionsResponse = getActionsFromIndex(gameState, startActionIndex);
                logger.debug("actionsResponse : " + actionsResponse);
                dispatcher.broadcastMessage(12 /* OperationCode.RequestSpecificActions */, JSON.stringify(actionsResponse), [message.sender]);
                break;
            case 14 /* OperationCode.killData */:
                try {
                    var userid = msg.userid, pieceIndex = msg.pieceIndex;
                    if (gameState.lastActionIndex !== undefined) {
                        var lastAction = gameState.actionHistory[gameState.lastActionIndex.toString()];
                        if (lastAction) {
                            if (!lastAction.kills) {
                                lastAction.kills = {};
                            }
                            lastAction.kills[userid] = pieceIndex;
                            lastAction.nextPlayerId = message.sender.userId;
                            dispatcher.broadcastMessage(11 /* OperationCode.UpdateGameState */, JSON.stringify(gameState.actionHistory), gameState.players.map(function (p) { return p.presence; }));
                            logger.info("Updated action history with kill data for player ".concat(userid, " on piece ").concat(pieceIndex));
                        }
                    }
                }
                catch (error) {
                    logger.error("Error processing killData: " + error);
                }
                break;
            case 7 /* OperationCode.DiceRoll */:
                dispatcher.broadcastMessage(7 /* OperationCode.DiceRoll */, message.data, gameState.players.map(function (player) { return player.presence; }));
                var diceRoll = msg.diceRoll;
                gameState.pendingDiceRoll = diceRoll;
                logger.info("Dice roll processed: ".concat(msg.diceRoll));
                break;
            case 6 /* OperationCode.Alphabets */:
                try {
                    dispatcher.broadcastMessage(6 /* OperationCode.Alphabets */, message.data, state.presences);
                }
                catch (error) {
                    logger.error("Error processing alphabets data: " + error);
                }
                break;
            case 8 /* OperationCode.SelectPiece */:
                try {
                    if (typeof gameState.pendingDiceRoll === "number") {
                        dispatcher.broadcastMessage(8 /* OperationCode.SelectPiece */, JSON.stringify(msg), state.presences);
                        updateActionHistory(gameState, message.sender.userId, gameState.pendingDiceRoll, msg.pieceIndex, gameState.pendingDiceRoll, logger);
                        dispatcher.broadcastMessage(11 /* OperationCode.UpdateGameState */, JSON.stringify(gameState.actionHistory), gameState.players.map(function (p) { return p.presence; }));
                        gameState.pendingDiceRoll = undefined;
                        gameState.killData = {};
                        logger.debug("Updated game state with new action history and cleared pending dice roll." +
                            gameState.actionHistory);
                    }
                }
                catch (error) {
                    logger.error("Error processing SelectPiece data: " + error);
                }
                break;
            case 9 /* OperationCode.CollectAlphabets */:
                try {
                    dispatcher.broadcastMessage(9 /* OperationCode.CollectAlphabets */, JSON.stringify(msg), state.presences);
                }
                catch (error) {
                    logger.error("Error processing CollectAlphabets data: " + error);
                }
                break;
            case 10 /* OperationCode.FillWord */:
                try {
                    dispatcher.broadcastMessage(10 /* OperationCode.FillWord */, JSON.stringify(msg), state.presences);
                }
                catch (error) {
                    logger.error("Error processing FillWord data: " + error);
                }
                break;
        }
    });
    return { state: state };
}
function determineNextPlayerId(gameState: GameState, currentPlayerId: string, diceRoll: number, killedPieceInfo?: { pieceIndex: number }) {
    if (diceRoll === 5) {
        return currentPlayerId;
    }
    if (killedPieceInfo)
        return currentPlayerId;
    var currentPlayerIndex = gameState.sortedPlayerIds.indexOf(currentPlayerId);
    var nextPlayerIndex = (currentPlayerIndex + 1) % gameState.sortedPlayerIds.length;
    return gameState.sortedPlayerIds[nextPlayerIndex];
}
function getActionsFromIndex(gameState: GameState, start: number) {
    var filteredHistory: Record<string, typeof gameState.actionHistory[string]> = {};
    for (var i = start; i <= gameState.actionIndex - 1; i++) {
        var actionKey = i.toString();
        if (gameState.actionHistory[actionKey]) {
            filteredHistory[actionKey] = gameState.actionHistory[actionKey];
        }
    }
    return filteredHistory;
}
var matchTerminate = function (ctx: Context, logger: Logger, nk: Nakama, dispatcher: Dispatcher, tick: number, state: MatchState, graceSeconds: number) {
    logger.debug("Match terminated");
    return null; // Returning null removes the match from running matches
};
var matchSignal = function (ctx: Context, logger: Logger, nk: Nakama, dispatcher: Dispatcher, tick: number, state: MatchState, data: string) {
    logger.debug("Lobby match signal received: " + data);
    return {
        state: state,
        data: "Lobby match signal received: " + data,
    };
};

interface RewardData {
    lastClaimDate: string | null;
    consecutiveDays: number;
}
function rpcClaimDailyReward(ctx: Context, logger: Logger, nk: Nakama, payload: string) {
    if (!ctx.userId) {
        throw new Error("No user ID in context");
    }

    const rewardsCollection = "user_rewards";
    const rewardsKey = "daily_reward_data";

    // Define the expected structure
    

    let rewardData: RewardData = { lastClaimDate: null, consecutiveDays: 0 };

    const objectId = {
        collection: rewardsCollection,
        key: rewardsKey,
        userId: ctx.userId,
    };

    const objects = nk.storageRead([objectId]);

    if (objects.length > 0 && objects[0].value) {
        rewardData = objects[0].value as RewardData; // Type assertion
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let lastClaimDate: Date | null = rewardData.lastClaimDate ? new Date(rewardData.lastClaimDate) : null;
    lastClaimDate?.setHours(0, 0, 0, 0);

    // Check if the last claim was today or yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    if (lastClaimDate?.getTime() === today.getTime()) {
        // Reward already claimed today
        return JSON.stringify({
            success: false,
            message: "Daily reward has already been claimed today.",
        });
    } else if (lastClaimDate?.getTime() === yesterday.getTime()) {
        // Consecutive claim
        rewardData.consecutiveDays += 1;
    } else {
        // Not consecutive, reset
        rewardData.consecutiveDays = 1;
    }

    // Calculate reward based on consecutiveDays and grant it
    const rewardAmount = calculateReward(rewardData.consecutiveDays);
    updateBalance(ctx, logger, nk, ctx.userId, rewardAmount, true);

    // Update last claim date and consecutive days
    rewardData.lastClaimDate = today.toISOString();

    // Define the type manually for storage requests

    const writeRequest: nkruntime.StorageWriteRequest = {
        collection: rewardsCollection,
        key: rewardsKey,
        userId: ctx.userId,
        value: rewardData,
        permissionRead: 1, // Use Nakama's predefined values
        permissionWrite: 0,
    };

    nk.storageWrite([writeRequest]);

    return JSON.stringify({
        success: true,
        reward: rewardAmount,
        consecutiveDays: rewardData.consecutiveDays,
        message: "Daily reward claimed successfully.",
    });
}



function calculateReward(consecutiveDays: number) {
    // Define your logic to calculate the reward based on consecutive days
    // Example: base reward of 10 coins, plus an extra 5 coins for each consecutive day
    return 250 * consecutiveDays;
}
function checkDailyRewards(ctx: Context, logger: Logger, nk: Nakama, payload: string) {
    if (!ctx.userId) {
        throw new Error("No user ID in context");
    }
    var rewardsCollection = "user_rewards";
    var rewardsKey = "daily_reward_data";
    // Prepare the read request for the user's reward data
    var readRequest = {
        collection: rewardsCollection,
        key: rewardsKey,
        userId: ctx.userId,
    };
    try {
        // Read the existing reward data for the user
        const objects = nk.storageRead([readRequest]);

        let rewardData: RewardData = { lastClaimDate: null, consecutiveDays: 0 };

        if (objects.length > 0 && objects[0].value) {
            rewardData = objects[0].value as RewardData; // Type assertion
        }
        // Check if today's reward has been claimed based on the last claim date
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        // Convert the last claim date from string to Date object
        var lastClaimDate = rewardData.lastClaimDate
            ? new Date(rewardData.lastClaimDate)
            : null;
        lastClaimDate === null || lastClaimDate === void 0 ? void 0 : lastClaimDate.setHours(0, 0, 0, 0);
        var hasClaimedToday = false;
        if (lastClaimDate && lastClaimDate.getTime() === today.getTime()) {
            hasClaimedToday = true;
        }
        // Return the current reward data and whether today's reward has been claimed
        return JSON.stringify({
            success: true,
            lastClaimDate: rewardData.lastClaimDate,
            consecutiveDays: rewardData.consecutiveDays,
            hasClaimedToday: hasClaimedToday,
        });
    }
    catch (error) {
        logger.error("Failed to read reward data: " + error);
        return JSON.stringify({
            success: false,
            message: "Failed to check daily rewards.",
        });
    }
}
function rpcAddCoins(context: Context, logger: Logger, nk: Nakama, payload: string) {
    if (!context.userId) {
        throw Error("No user ID in context");
    }
    // Parse payload to determine the amount of coins to add
    var parsedPayload;
    try {
        parsedPayload = JSON.parse(payload);
    }
    catch (error) {
        logger.error("JSON parse error: %s", error);
        throw error;
    }
    var amountToAdd = parsedPayload.coins;
    if (!amountToAdd) {
        throw Error("No amount specified");
    }
    // Update player wallet
    var changeset = { coins: amountToAdd };
    try {
        nk.walletUpdate(context.userId, changeset, {}, true);
    }
    catch (error) {
        logger.error("walletUpdate error: %q", error);
        throw error;
    }
    // Construct response
    var response = { success: true, coinsAdded: amountToAdd };
    return JSON.stringify(response);
}
function rpcDeductCoins(context: Context, logger: Logger, nk: Nakama, payload: string) {
    if (!context.userId) {
        throw Error("No user ID in context");
    }
    var parsedPayload;
    try {
        parsedPayload = JSON.parse(payload);
    }
    catch (error) {
        logger.error("JSON parse error: %s", error);
        throw error;
    }
    var amountToDeduct = parsedPayload.coins;
    if (!amountToDeduct) {
        throw Error("No amount specified");
    }
    // Deduct coins from player wallet
    var changeset = { coins: -amountToDeduct };
    try {
        nk.walletUpdate(context.userId, changeset, {}, true);
    }
    catch (error) {
        logger.error("walletUpdate error: %q", error);
        throw error;
    }
    var response = { success: true, coinsDeducted: amountToDeduct };
    return JSON.stringify(response);
}
function getBalance(ctx: Context, logger: Logger, nk: Nakama, payload: string) {
    if (!ctx.userId) {
        throw new Error("No user ID in context");
    }
    // Assuming you might later want to allow input for different operation types or keys
    if (payload) {
        throw new Error("No input allowed");
    }
    var objectId = {
        collection: "coins",
        key: "balance",
        userId: ctx.userId,
    };
    try {
        // Await the asynchronous storage read operation
        var objects = nk.storageRead([objectId]);
        // Check if the storage object was found and has a balance
        if (objects.length > 0 &&
            objects[0].value &&
            typeof objects[0].value.coins === "number") {
            var balance = objects[0].value.coins;
            logger.info("User ".concat(ctx.userId, " has ").concat(balance.toString(), " coins."));
            return JSON.stringify({ success: true, balance: balance });
        }
        else {
            // If no coins were found, assume a balance of 0 or handle accordingly
            return JSON.stringify({ success: true, balance: 0 });
        }
    }
    catch (error) {
        logger.error("storageRead error for user ".concat(ctx.userId, ": ").concat(error as string));
        return JSON.stringify({
            success: false,
            message: "Failed to retrieve balance.",
        });
    }
}

function updateBalance(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, userId: string, amount: number, isDeposit: boolean) {
    var objectId: nkruntime.StorageReadRequest = {
        collection: "coins",
        key: "balance",
        userId: userId,
    };

    var currentBalance = 0;
    var version: string | undefined; // Version should be undefined initially.

    try {
        var objects = nk.storageRead([objectId]);

        if (objects.length > 0) {
            var storedValue = objects[0].value as { coins?: number };
            currentBalance = storedValue.coins ?? 0;
            version = objects[0].version; // Get version if it exists.
        }

        // Update the balance based on the operation.
        currentBalance = isDeposit ? currentBalance + amount : currentBalance - amount;

        // Prevent balance from going negative.
        if (currentBalance < 0) {
            throw new Error("Balance cannot be negative.");
        }

        var write: nkruntime.StorageWriteRequest = {
            collection: "coins",
            key: "balance",
            userId: userId,
            value: { coins: currentBalance },
            permissionRead: 1, // Fix type issue
            permissionWrite: 0, // Fix type issue
        };

        if (version) {
            write.version = version; // Only set version if it's not empty.
        }

        // Write the updated balance back to storage.
        nk.storageWrite([write]);

        logger.info(`Balance updated for user ${userId}. New balance: ${currentBalance}`);
    } catch (error) {
        logger.error(`Failed to update balance for userId: ${userId}. Error: ${error}`);
        throw error;
    }
}

function rpcUpdateBalance(ctx: Context, logger: Logger, nk: Nakama, payload: string) {
    if (!ctx.userId) {
        throw new Error("No user ID in context");
    }
    // Parse the incoming payload.
    var request = JSON.parse(payload);
    var amount = request.amount;
    var isDeposit = request.isDeposit; // true for deposit, false for withdrawal
    // Call the updateBalance function.
    updateBalance(ctx, logger, nk, ctx.userId, amount, isDeposit);
    // Return a success message.
    return JSON.stringify({
        success: true,
        message: "Balance updated successfully.",
    });
}

function rpcSavePlayerInfo(context: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string) {
    var newPlayerInfo = JSON.parse(payload);
    var userId = context.userId;
    
    if (!userId) {
        logger.info("Invalid userId");
        return JSON.stringify({ success: false, message: "Invalid userId" });
    }

    // Retrieve existing data
    var objects = nk.storageRead([
        {
            collection: "playerInfo",
            key: "profile",
            userId: userId,
        },
    ]);

    var existingPlayerInfo: Record<string, any> = objects.length > 0 ? objects[0].value : {};

    // Merge existing data with new data
    var updatedPlayerInfo = { ...existingPlayerInfo, ...newPlayerInfo };

    // Validate merged player information (optional, depends on requirements)
    if (!updatedPlayerInfo.username || !updatedPlayerInfo.email || !updatedPlayerInfo.country || !updatedPlayerInfo.educationalDetails) {
        throw new Error("Missing required player information");
    }

    // Prepare storage object
    var storageObject: nkruntime.StorageWriteRequest = {
        collection: "playerInfo",
        key: "profile",
        value: updatedPlayerInfo,
        userId: userId,
        permissionRead: 1, // Fix type issue
        permissionWrite: 0, // Fix type issue
    };

    // Write to storage
    nk.storageWrite([storageObject]);
    
    logger.debug(`Player information updated for user: ${userId}`);

    // Optionally, return a success message or any other information
    return JSON.stringify({ success: true, message: "Player information successfully updated!" });
}

function rpcGetPlayerInfo(context: Context, logger: Logger, nk: Nakama) {
    // Ensure userId is present
    var userId = context.userId;
    if (!userId) {
        throw new Error("Invalid userId.");
    }

    // Define the storage query
    var readRequests: nkruntime.StorageReadRequest[] = [
        {
            collection: "playerInfo",
            key: "profile",
            userId: userId, // userId is now guaranteed to be a string
        },
    ];

    // Execute the storage read
    var results = nk.storageRead(readRequests);

    if (results.length === 0) {
        throw new Error("No player information found for the user.");
    }

    var playerInfo = results[0].value;
    logger.debug(`Player information retrieved for user: ${userId}`);

    // Return the player information as JSON
    return JSON.stringify(playerInfo);
}

// RPC function to generate a referral code
function generateReferralCode(ctx: Context, logger: Logger, nk: Nakama, payload: string) {
    var userId = ctx.userId;
    var referralCode = nk.uuidv4();
    var storageWriteRequest = {
        collection: "referral_codes",
        key: referralCode,
        userId: userId,
        value: { referred_users: [] },
    };
    nk.storageWrite([storageWriteRequest]);
    return JSON.stringify({ code: referralCode });
}
// RPC function to validate a referral code
function validateReferralCode(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string) {
    var userId = ctx.userId;
    if (!userId) {
        return JSON.stringify({ success: false, message: "Invalid user ID." });
    }

    var input = JSON.parse(payload);
    var referralCode = input.code;

    var storageReadRequest: nkruntime.StorageReadRequest = {
        collection: "referral_codes",
        key: referralCode,
        userId: "", // Set userId to null to read global data
    };

    var objects = nk.storageRead([storageReadRequest]);

    if (objects.length === 0) {
        return JSON.stringify({ success: false, message: "Invalid code." });
    }

    var referralData = objects[0].value;

    // Ensure `referred_users` exists and is an array
    if (!Array.isArray(referralData.referred_users)) {
        referralData.referred_users = [];
    }

    // Add the referring user ID
    referralData.referred_users.push(userId);

    var storageWriteRequest: nkruntime.StorageWriteRequest = {
        collection: "referral_codes",
        key: referralCode,
        userId: objects[0].userId, // Keep the original userId
        value: referralData,
        permissionRead: 2, // Public read
        permissionWrite: 0, // Only owner can write
    };

    nk.storageWrite([storageWriteRequest]);

    // Add reward logic here if needed
    return JSON.stringify({ success: true });
}
function createLeaderboard(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string) {
    var id = "leaderboard_id";
    var authoritative = true;
    var sort: nkruntime.SortOrder = nkruntime.SortOrder.DESCENDING; // Use enum instead of string
    var operator: nkruntime.Operator = nkruntime.Operator.BEST; // Use enum instead of string
    var reset = "0 0 1 * *"; // Reset every month
    var metadata = {};

    try {
        nk.leaderboardCreate(id, authoritative, sort, operator, reset, metadata);
        logger.info("Leaderboard created successfully.");
        return JSON.stringify({ success: true });
    } catch (error) {
        var errorMessage = "Unknown error";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        logger.error("Failed to create leaderboard: %s", errorMessage);
        return JSON.stringify({ success: false, error: errorMessage });
    }
}

function writeScore(ctx: Context, logger: Logger, nk: Nakama, payload: string) {
    try {
        var request = JSON.parse(payload);
        var leaderboardId = request.leaderboardId;
        var score = request.score;
        const userId = ctx.userId;
        if(!userId){
            console.log("Invalid user");
            return JSON.stringify({success: false, error: "Invalid userId"})
        }
        if (typeof leaderboardId !== "string" || typeof score !== "number") {
            throw new Error("Invalid payload: expects leaderboardId as string and score as number");
        }
        var metadata = {};
        nk.leaderboardRecordWrite(leaderboardId, userId, ctx.username, score, 0, metadata);
        logger.info("Score written successfully.");
        return JSON.stringify({ success: true });
    }
    catch (error) {
        var errorMessage = "Unknown error";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        logger.error("Failed to write score: %s", errorMessage);
        return JSON.stringify({ success: false, error: errorMessage });
    }
}
function fetchLeaderboard(ctx: Context, logger: Logger, nk: Nakama, payload: string) {
    try {
        var request = JSON.parse(payload);
        var leaderboardId = request.leaderboardId;
        if (typeof leaderboardId !== "string") {
            throw new Error("Invalid payload: expects leaderboardId as string");
        }
        var records = nk.leaderboardRecordsList(leaderboardId, [], 10);
        logger.info("Leaderboard fetched successfully.");
        return JSON.stringify({ success: true, records: records });
    }
    catch (error) {
        var errorMessage = "Unknown error";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        logger.error("Failed to fetch leaderboard: %s", errorMessage);
        return JSON.stringify({ success: false, error: errorMessage });
    }
}
function storeWord(context: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string) {
    if (!context.userId) {
        throw Error("No user ID in context");
    }

    var parsedPayload;
    try {
        parsedPayload = JSON.parse(payload);
    } catch (error) {
        logger.error("JSON parse error: %s", error);
        throw error;
    }

    var word = parsedPayload.word;
    var meaning = parsedPayload.meaning;
    if (!word || !meaning) {
        throw Error("Both word and meaning must be specified");
    }

    var objectId = {
        collection: "user_words",
        key: "words_list",
        userId: context.userId,
    };

    try {
        var objects = nk.storageRead([objectId]);
        var wordsList = [];
        if (objects.length > 0) {
            wordsList = objects[0].value.words || [];
        }

        wordsList.push({ word: word, meaning: meaning });

        var writeRequest = {
            collection: "user_words",
            key: "words_list",
            userId: context.userId,
            value: { words: wordsList },
            permissionRead: 1 as nkruntime.ReadPermissionValues, // ✅ Use enum
            permissionWrite: 0 as nkruntime.WritePermissionValues, // ✅ Use enum
        };

        nk.storageWrite([writeRequest]);

        logger.info(`Added word "${word}" with meaning "${meaning}" to user ${context.userId}'s words list.`);
        return JSON.stringify({ success: true, word: word, meaning: meaning });
    } catch (error) {
        logger.error(`storageWrite error for user ${context.userId}: ${error}`);
        return JSON.stringify({
            success: false,
            message: "Failed to store the word.",
        });
    }
}

function fetchWordsList(context: Context, logger: Logger, nk: Nakama, payload: string) {
    if (!context.userId) {
        throw Error("No user ID in context");
    }
    var objectId = {
        collection: "user_words",
        key: "words_list",
        userId: context.userId,
    };
    try {
        var objects = nk.storageRead([objectId]);
        var wordsList = [];
        if (objects.length > 0) {
            wordsList = objects[0].value.words || [];
        }
        logger.info("Fetched words list for user ".concat(context.userId, "."));
        return JSON.stringify({ success: true, words: wordsList });
    }
    catch (error) {
        logger.error("storageRead error for user ".concat(context.userId, ": ").concat(error as string));
        return JSON.stringify({
            success: false,
            message: "Failed to fetch the words list.",
        });
    }
}
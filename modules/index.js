"use strict";
const MaxPlayers = 4;
const rpc = (ctx, logger, nakama, payload) => {
    logger.info("Received payload: " + payload);
    return JSON.stringify({ success: true });
};
let joinOrCreateMatch = function (context, logger, nakama, payload) {
    let matches;
    const MatchesLimit = 1;
    const MinimumPlayers = 0;
    var label = { open: true };
    matches = nakama.matchList(MatchesLimit, true, JSON.stringify(label), MinimumPlayers, MaxPlayers - 1);
    if (matches.length > 0)
        return matches[0].matchId;
    return nakama.matchCreate(MatchModuleName);
};
const JoinOrCreateMatchRpc = "JoinOrCreateMatchRpc";
const LogicLoadedLoggerInfo = "Custom logic loaded.";
const MatchModuleName = "match";
function InitModule(ctx, logger, nk, initializer) {
    initializer.registerRpc(JoinOrCreateMatchRpc, joinOrCreateMatch);
    logger.info(LogicLoadedLoggerInfo);
}

interface MatchLabel
{
    open: boolean
}

const MaxPlayers = 4;

const rpc: nkruntime.RpcFunction = (ctx: nkruntime.Context, logger: nkruntime.Logger, nakama: nkruntime.Nakama, payload: string) => {
    logger.info("Received payload: " + payload);
    return JSON.stringify({success: true})
};

let joinOrCreateMatch: nkruntime.RpcFunction = function (context: nkruntime.Context, logger: nkruntime.Logger, nakama: nkruntime.Nakama, payload: string): string
{
    let matches: nkruntime.Match[];
    const MatchesLimit = 1;
    const MinimumPlayers = 0;
    var label: MatchLabel = { open: true }
    matches = nakama.matchList(MatchesLimit, true, JSON.stringify(label), MinimumPlayers, MaxPlayers - 1);
    if (matches.length > 0)
        return matches[0].matchId;

    return nakama.matchCreate(MatchModuleName);
}

const JoinOrCreateMatchRpc = "JoinOrCreateMatchRpc";
const LogicLoadedLoggerInfo = "Custom logic loaded.";
const MatchModuleName = "match";

function InitModule(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer)
{
    initializer.registerRpc(JoinOrCreateMatchRpc, joinOrCreateMatch);
    

    logger.info(LogicLoadedLoggerInfo);
}



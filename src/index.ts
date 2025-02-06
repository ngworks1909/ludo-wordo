import {Context, Logger, Nakama, RpcFunction} from 'nakama-runtime'


const rpc: RpcFunction = (ctx: Context, logger: Logger, nakama: Nakama, payload: string) => {
    console.log(payload);
}
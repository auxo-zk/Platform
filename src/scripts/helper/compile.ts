import fs from 'fs/promises';
import { Cache } from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { CampaignContract, RollupCampaign } from '../../contracts/Campaign.js';
import { ProjectContract, RollupProject } from '../../contracts/Project.js';
import {
    ParticipationContract,
    RollupParticipation,
} from '../../contracts/Participation.js';
import { FundingContract, RollupFunding } from '../../contracts/Funding.js';
import {
    RollupTreasuryManager,
    TreasuryManagerContract,
} from '../../contracts/TreasuryManager.js';
import {
    DkgContract,
    RequestContract,
    RequesterContract,
    ResponseContract,
    UpdateKey,
    UpdateRequest,
    UpdateTask,
    BatchDecryption,
    ComputeResponse,
    FinalizeResponse,
    ZkApp,
} from '@auxo-dev/dkg';
import { VestingContract } from '../../contracts/Vesting.js';
import {
    CommitmentContract,
    RollupCommitment,
} from '../../contracts/Commitment.js';

export { compile };

async function compile(
    cache = Cache.FileSystem('./caches'),
    programs: Utils.Program[] = [],
    profiler = Utils.getProfiler('compile', fs),
    logger?: Utils.Logger
) {
    try {
        if (programs.length > 0) {
            for (let i = 0; i < programs.length; i++) {
                await Utils.compile(programs[i], cache, profiler, logger);
            }
        } else {
            // await Utils.compile(FinalizeResponse, cache, profiler, logger);
            // await Utils.compile(BatchDecryption, cache, profiler, logger);
            await Utils.compile(UpdateTask, cache, profiler, logger);
            await Utils.compile(RequesterContract, cache, profiler, logger);
            // await Utils.compile(ComputeResponse, cache, profiler, logger);
            // await Utils.compile(ResponseContract, cache, profiler, logger);
            await Utils.compile(UpdateKey, cache, profiler, logger);
            await Utils.compile(DkgContract, cache, profiler, logger);
            await Utils.compile(
                ZkApp.Request.ComputeResult,
                cache,
                profiler,
                logger
            );
            await Utils.compile(UpdateRequest, cache, profiler, logger);
            await Utils.compile(RequestContract, cache, profiler, logger);
            await Utils.compile(RollupProject, cache, profiler, logger);
            await Utils.compile(RollupCampaign, cache, profiler, logger);
            await Utils.compile(RollupParticipation, cache, profiler, logger);
            await Utils.compile(RollupFunding, cache, profiler, logger);
            await Utils.compile(RollupTreasuryManager, cache, profiler, logger);
            await Utils.compile(RollupCommitment, cache, profiler, logger);
            await Utils.compile(ProjectContract, cache, profiler, logger);
            await Utils.compile(CampaignContract, cache, profiler, logger);
            await Utils.compile(ParticipationContract, cache, profiler, logger);
            await Utils.compile(FundingContract, cache, profiler, logger);
            await Utils.compile(
                TreasuryManagerContract,
                cache,
                profiler,
                logger
            );
            await Utils.compile(VestingContract, cache, profiler, logger);
            await Utils.compile(CommitmentContract, cache, profiler, logger);
        }
    } catch (error) {
        console.error(error);
    } finally {
        profiler.store();
    }
}

// compile(undefined, [], undefined, {
//     error: true,
//     info: true,
//     memoryUsage: false,
// })
//     .then()
//     .catch((err) => {
//         console.error(err);
//         process.exit(1);
//     });

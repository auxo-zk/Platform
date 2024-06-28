import {
    Cache,
    Field,
    Mina,
    PrivateKey,
    Provable,
    PublicKey,
    Reducer,
    fetchAccount,
    UInt64,
    Account,
} from 'o1js';
import { compile } from '../../helper/compile.js';
import axios from 'axios';
import {
    Timeline,
    TimelineLevel1Witness,
} from '../../../storages/CampaignStorage.js';
import { CampaignMockData } from '../../mock/CampaignMockData.js';
import {
    MemberArray,
    ProjectMemberLevel1Witness,
    ProjectMemberLevel2Witness,
    TreasuryAddressLevel1Witness,
} from '../../../storages/ProjectStorage.js';
import { Network } from '../../helper/config.js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../../helper/prepare.js';
import {
    CampaignStateStorage,
    ClaimedAmountLevel1Witness,
} from '../../../storages/TreasuryManagerStorage.js';
import { TimelineStorage } from '../../../storages/CampaignStorage.js';
import { Storage, ZkAppRef } from '@auxo-dev/dkg';
import { ZkAppIndex } from '../../../Constants.js';
import { AddressStorage, RequestKeyIndexStorage } from '@auxo-dev/dkg';
import { Participation, TreasuryManager } from '../../../contracts/index.js';
import { ParticipationMockData } from '../../mock/ParticipationMockData.js';
import { ParticipationContract } from '../../../contracts/Participation.js';
import {
    ParticipationStorage,
    ProjectCounterLevel1Witness,
    ProjectIndexLevel1Witness,
} from '../../../storages/ParticipationStorage.js';
import { fetchAccounts } from '../../helper/index.js';
import { TreasuryManagerContract } from '../../../contracts/TreasuryManager.js';
import { TreasuryAddressStorage } from '../../../storages/ProjectStorage.js';
import { ProjectContract } from '../../../contracts/Project.js';
import { NullifierContract } from '../../../contracts/Nullifier.js';
import { NullifierStorage } from '../../../storages/NullifierStorage.js';

async function main() {
    let _ = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs: true },
        {
            aliases: [
                'rollup',
                'committee',
                'dkg',
                'round1',
                'round2',
                'request',
                'response',
                'project',
                'campaign',
                'nullifier',
                'funding',
                'funding_requester',
                'vesting',
                'vesting_requester',
                'participation',
                'treasury_manager',
            ],
        }
    );

    const logger: Utils.Logger = {
        info: true,
        error: true,
        memoryUsage: true,
    };

    const nullifierContract = new NullifierContract(
        _.accounts.nullifier.publicKey
    );

    await fetchAccounts([_.accounts.nullifier.publicKey]);

    // Compile programs
    await compile(_.cache, [], undefined, logger);

    // empty merklemap
    let storage = new NullifierStorage();
    // let nullifier = Field(123456789999); // 1
    let nullifier = Field(23423423); // 2
    let projectId = Field(0);
    let vestingId = Field(0);

    let nullifierIndex = NullifierStorage.calculateLevel1Index({
        nullifier,
        projectId,
        vestingId,
    });

    let tx = await Utils.proveAndSendTx(
        NullifierContract.name,
        'commit',
        async () => {
            await nullifierContract.commit(
                nullifier,
                projectId,
                vestingId,
                storage.getLevel1Witness(nullifierIndex)
            );
        },
        _.feePayer,
        true,
        undefined,
        logger
    );

    Provable.log('tx: ', tx.hash);
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });

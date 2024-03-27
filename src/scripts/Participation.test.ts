import {
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Reducer,
    Provable,
    UInt32,
    Scalar,
    Bool,
    UInt64,
    Group,
    Cache,
} from 'o1js';
import { ProjectContract, RollupProject } from '../contracts/Project';
import {
    CampaignAction,
    CampaignContract,
    RollupCampaign,
} from '../contracts/Campaign';
import {
    CampaignTimelineStateEnum,
    DefaultRootForCampaignTree,
    IpfsHashStorage,
    Timeline,
    TimelineStorage,
} from '../storages/CampaignStorage';
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    MemberArray,
} from '../storages/ProjectStorage';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { fetchActions, LocalBlockchain } from 'o1js/dist/node/lib/mina';
import { CampaignMockData } from './mock/CampaignMockData';
import { Action } from './interfaces/action.interface';
import { Utilities } from './utils';
import { ParticipationContract } from '../contracts/Participation';

let proofsEnabled = true;

describe('Campaign', () => {
    const cache = Cache.FileSystem('./caches');

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        participationContractPrivateKey: PrivateKey,
        participationContractPublicKey: PublicKey,
        participationContract: ParticipationContract;
    const Local = Mina.LocalBlockchain({ proofsEnabled });

    beforeAll(async () => {
        Mina.setActiveInstance(Local);
        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);

        await RollupCampaign.compile({ cache });
        if (proofsEnabled) {
            await CampaignContract.compile({ cache });
        }

        participationContractPrivateKey = PrivateKey.random();
        participationContractPublicKey =
            participationContractPrivateKey.toPublicKey();
        participationContract = new ParticipationContract(
            participationContractPublicKey
        );
        await localDeploy();
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            participationContract.deploy();
        });
        await tx.prove();
        await tx.sign([deployerKey, participationContractPrivateKey]).send();
    }

    it('Default root should be correct', async () => {
        //
    });

    it('Test success flow', async () => {
        //
    });
});

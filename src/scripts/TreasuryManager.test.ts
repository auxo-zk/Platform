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
import {
    ProjectAction,
    ProjectContract,
    RollupProject,
} from '../contracts/Project';
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    IpfsHashStorage as ProjectIpfsHashStorage,
    MemberArray,
    ProjectMemberStorage,
    ProjectActionEnum,
    TreasuryAddressStorage,
} from '../storages/ProjectStorage';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { fetchActions } from 'o1js/dist/node/lib/mina';
import { Action } from './interfaces/action.interface';
import { Utilities } from './utils';
import { INSTANCE_LIMITS } from '../Constants';
import { Storage } from '@auxo-dev/dkg';
import {
    ProjectCounterStorage,
    ProjectIndexStorage,
    IpfsHashStorage as ParticipationIpfsHashStorage,
} from '../storages/ParticipationStorage';
import {
    KeyIndexStorage,
    TimelineStorage,
    IpfsHashStorage as CampaignIpfsHashStorage,
} from '../storages/CampaignStorage';
import { CampaignContractMock } from '../contracts/Campaign';
import { ParticipationContractMock } from '../contracts/Participation';
import { ZkAppStorage } from '../storages/SharedStorage';
import { TreasuryManagerContract } from '../contracts/TreasuryManager';
import { FundingInformationStorage } from '../storages/FundingStorage';

let proofsEnabled = true;

describe('TreasuryManager', () => {
    const cache = Cache.FileSystem('./caches');

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        zkAppStorage: ZkAppStorage,
        campaignContractPrivateKey: PrivateKey,
        campaignContractPublicKey: PublicKey,
        campaignContract: CampaignContractMock,
        projectContractPrivateKey: PrivateKey,
        projectContractPublicKey: PublicKey,
        projectContract: ProjectContract,
        participationContractPrivateKey: PrivateKey,
        participationContractPublicKey: PublicKey,
        participationContract: ParticipationContractMock,
        treasuryManagerContractPrivateKey: PrivateKey,
        treasuryManagerContractPublicKey: PublicKey,
        treasuryManagerContract: TreasuryManagerContract,
        dkgContractPrivateKey: PrivateKey,
        dkgContractPublicKey: PublicKey,
        requesterContractPrivateKey: PrivateKey,
        requesterContractPublicKey: PublicKey;

    const Local = Mina.LocalBlockchain({ proofsEnabled });

    let nextCampaignId = Field(0);
    const campaignTrees = {
        timelineTree: new TimelineStorage(),
        ipfsHashTree: new CampaignIpfsHashStorage(),
        keyIndexTree: new KeyIndexStorage(),
    };

    let nextProjectId = Field(0);
    const projectTrees = {
        memberTree: new ProjectMemberStorage(),
        ipfsHashTree: new ProjectIpfsHashStorage(),
        treasuryAddressTree: new TreasuryAddressStorage(),
    };

    const participationTrees = {
        projectIndexTree: new ProjectIndexStorage(),
        projectCounterTree: new ProjectCounterStorage(),
        ipfsHashTree: new ParticipationIpfsHashStorage(),
    };

    const fundingTrees = {
        fundingInformationTree: new FundingInformationStorage(),
    };

    const dkgTrees = {
        publicKeyTree: new Storage.DKGStorage.PublicKeyStorage(),
    };

    const requesterTrees = {
        keyIndexTree: new Storage.RequesterStorage.RequesterKeyIndexStorage(),
    };

    beforeAll(async () => {
        Mina.setActiveInstance(Local);
        await RollupProject.compile({ cache });
        if (proofsEnabled) {
            await ProjectContract.compile({ cache });
        }

        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);

        campaignContractPrivateKey = PrivateKey.random();
        campaignContractPublicKey = campaignContractPrivateKey.toPublicKey();
        campaignContract = new CampaignContractMock(campaignContractPublicKey);

        projectContractPrivateKey = PrivateKey.random();
        projectContractPublicKey = projectContractPrivateKey.toPublicKey();
        projectContract = new ProjectContract(projectContractPublicKey);

        participationContractPrivateKey = PrivateKey.random();
        participationContractPublicKey =
            participationContractPrivateKey.toPublicKey();
        participationContract = new ParticipationContractMock(
            participationContractPublicKey
        );

        treasuryManagerContractPrivateKey = PrivateKey.random();
        treasuryManagerContractPublicKey =
            treasuryManagerContractPrivateKey.toPublicKey();
        treasuryManagerContract = new TreasuryManagerContract(
            treasuryManagerContractPublicKey
        );

        dkgContractPrivateKey = PrivateKey.random();
        dkgContractPublicKey = dkgContractPrivateKey.toPublicKey();

        requesterContractPrivateKey = PrivateKey.random();
        requesterContractPublicKey = requesterContractPrivateKey.toPublicKey();

        zkAppStorage = Utilities.getZkAppStorage({
            campaignAddress: campaignContractPublicKey,
            projectAddress: projectContractPublicKey,
            participationAddress: participationContractPublicKey,
            dkgAddress: dkgContractPublicKey,
            requesterAddress: requesterContractPublicKey,
        });

        await localDeploy();
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            campaignContract.deploy();
            campaignContract['zkAppRoot'].set(zkAppStorage.root);
            AccountUpdate.fundNewAccount(deployerAccount);
            projectContract.deploy();
            AccountUpdate.fundNewAccount(deployerAccount);
            participationContract.deploy();
            participationContract['zkAppRoot'].set(zkAppStorage.root);
        });
        await tx.prove();
        await tx
            .sign([
                deployerKey,
                campaignContractPrivateKey,
                projectContractPrivateKey,
                participationContractPrivateKey,
            ])
            .send();
    }

    it('Default root should be correct', async () => {
        //
    });
});

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
    CampaignContractMock,
    RollupCampaign,
} from '../contracts/Campaign';
import {
    CampaignTimelineStateEnum,
    DefaultRootForCampaignTree,
    IpfsHashStorage,
    KeyIndexStorage,
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
import {
    DefaultRootForZkAppTree,
    getZkAppRef,
    ZkAppStorage,
} from '../storages/SharedStorage';
import { Storage } from '@auxo-dev/dkg';
import { ZkAppEnum } from '../Constants';

let proofsEnabled = true;

describe('Campaign', () => {
    const cache = Cache.FileSystem('./caches');

    let zkAppStorage: ZkAppStorage,
        deployerKey: PrivateKey,
        deployerAccount: PublicKey,
        senderKey: PrivateKey,
        senderAccount: PublicKey,
        campaignContractPrivateKey: PrivateKey,
        campaignContractPublicKey: PublicKey,
        campaignContract: CampaignContractMock,
        dkgContractPrivateKey: PrivateKey,
        dkgContractPublicKey: PublicKey,
        requesterContractPrivateKey: PrivateKey,
        requesterContractPublicKey: PublicKey;

    let nextCampaignId = Field(0);
    const timelineTree = new TimelineStorage();
    const ipfsHashTree = new IpfsHashStorage();
    const keyIndexTree = new KeyIndexStorage();
    const keyStatusTree = new Storage.DKGStorage.KeyStatusStorage();
    const Local = Mina.LocalBlockchain({ proofsEnabled });

    beforeAll(async () => {
        Mina.setActiveInstance(Local);
        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);

        await RollupCampaign.compile({ cache });
        if (proofsEnabled) {
            // await CampaignContract.compile({ cache });
            await CampaignContractMock.compile({ cache });
        }

        campaignContractPrivateKey = PrivateKey.random();
        campaignContractPublicKey = campaignContractPrivateKey.toPublicKey();
        campaignContract = new CampaignContractMock(campaignContractPublicKey);
        dkgContractPrivateKey = PrivateKey.random();
        dkgContractPublicKey = campaignContractPrivateKey.toPublicKey();
        requesterContractPrivateKey = PrivateKey.random();
        requesterContractPublicKey = campaignContractPrivateKey.toPublicKey();
        zkAppStorage = Utilities.getZkAppStorage({
            campaignAddress: campaignContractPublicKey,
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
        });
        await tx.prove();
        await tx.sign([deployerKey, campaignContractPrivateKey]).send();
    }

    it('Default root should be correct', async () => {
        expect(campaignContract.nextCampaignId.get()).toEqual(Field(0));
        expect(campaignContract.timelineRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
        expect(campaignContract.ipfsHashRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
        expect(campaignContract.keyIndexRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
        expect(campaignContract.zkAppRoot.get()).toEqual(zkAppStorage.root);
        expect(campaignContract.actionState.get()).toEqual(
            Reducer.initialActionState
        );
    });

    it('Test get campaign timeline state', async () => {
        const start =
            Number(Mina.getNetworkConstants().genesisTimestamp.toBigInt()) +
            1000;
        const startParticipation =
            start + CampaignMockData[0].timelinePeriod.preparation;
        const startFunding =
            startParticipation +
            CampaignMockData[0].timelinePeriod.participation;
        const startRequesting =
            startFunding + CampaignMockData[0].timelinePeriod.funding;
        const timeline = new Timeline({
            startParticipation: new UInt64(startParticipation),
            startFunding: new UInt64(startFunding),
            startRequesting: new UInt64(startRequesting),
        });
        let tx = await Mina.transaction(senderAccount, () => {
            campaignContract.createCampaign(
                timeline,
                IpfsHash.fromString(CampaignMockData[0].ipfsHash),
                Field(CampaignMockData[0].committeeId),
                Field(CampaignMockData[0].keyId),
                // keyStatusTree.getWitness(Field(0)),
                zkAppStorage.getWitness(Field(ZkAppEnum.CAMPAIGN)),
                zkAppStorage.getZkAppRef(ZkAppEnum.DKG, dkgContractPublicKey),
                zkAppStorage.getZkAppRef(
                    ZkAppEnum.REQUESTER,
                    requesterContractPublicKey
                )
            );
        });
        await tx.prove();
        await tx.sign([senderKey]).send();
        const actions: Action[] = (await fetchActions(
            campaignContractPublicKey
        )) as Action[];
        expect(actions.length).toEqual(1);
        const campaignAction = CampaignAction.fromFields(
            Utilities.stringArrayToFields(actions[0].actions[0])
        );
        let proof = await RollupCampaign.firstStep(
            nextCampaignId,
            timelineTree.root,
            ipfsHashTree.root,
            keyIndexTree.root,
            campaignContract.actionState.get()
        );
        proof = await RollupCampaign.createCampaignStep(
            proof,
            campaignAction,
            timelineTree.getLevel1Witness(nextCampaignId),
            ipfsHashTree.getLevel1Witness(nextCampaignId),
            keyIndexTree.getLevel1Witness(nextCampaignId)
        );
        tx = await Mina.transaction(senderAccount, () => {
            campaignContract.rollup(proof);
        });
        await tx.prove();
        await tx.sign([senderKey]).send();
        timelineTree.updateLeaf(
            nextCampaignId,
            TimelineStorage.calculateLeaf(campaignAction.timeline)
        );
        ipfsHashTree.updateLeaf(
            nextCampaignId,
            IpfsHashStorage.calculateLeaf(campaignAction.ipfsHash)
        );
        keyIndexTree.updateLeaf(
            nextCampaignId,
            KeyIndexStorage.calculateLeaf({
                committeeId: campaignAction.committeeId,
                keyId: campaignAction.keyId,
            })
        );
        expect(timelineTree.root).toEqual(campaignContract.timelineRoot.get());
        expect(ipfsHashTree.root).toEqual(campaignContract.ipfsHashRoot.get());
        expect(keyIndexTree.root).toEqual(campaignContract.keyIndexRoot.get());
        Local.incrementGlobalSlot(1);
        expect(
            campaignContract.getCampaignTimelineState(
                Field(0),
                timeline,
                timelineTree.getLevel1Witness(Field(0))
            )
        ).toEqual(Field(CampaignTimelineStateEnum.PREPARATION));
        Local.incrementGlobalSlot(1);
        expect(
            campaignContract.getCampaignTimelineState(
                Field(0),
                timeline,
                timelineTree.getLevel1Witness(Field(0))
            )
        ).toEqual(Field(CampaignTimelineStateEnum.PARTICIPATION));
        Local.incrementGlobalSlot(1);
        expect(
            campaignContract.getCampaignTimelineState(
                Field(0),
                timeline,
                timelineTree.getLevel1Witness(Field(0))
            )
        ).toEqual(Field(CampaignTimelineStateEnum.FUNDING));
        Local.incrementGlobalSlot(1);
        expect(
            campaignContract.getCampaignTimelineState(
                Field(0),
                timeline,
                timelineTree.getLevel1Witness(Field(0))
            )
        ).toEqual(Field(CampaignTimelineStateEnum.REQUESTING));
    });
});

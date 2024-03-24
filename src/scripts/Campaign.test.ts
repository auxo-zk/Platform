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
    KeyStorage,
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
import { CampaignMockData } from './CampaignMockData';
import { Action } from './interfaces/action.interface';
import { Utilities } from './utils';

let proofsEnabled = true;

describe('Campaign', () => {
    const cache = Cache.FileSystem('./caches');

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        campaignContractPublicKey: PublicKey,
        campaignContractPrivateKey: PrivateKey,
        campaignContract: CampaignContract;
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

        campaignContractPrivateKey = PrivateKey.random();
        campaignContractPublicKey = campaignContractPrivateKey.toPublicKey();
        campaignContract = new CampaignContract(campaignContractPublicKey);
        await localDeploy();
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            campaignContract.deploy();
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
        expect(campaignContract.keyRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
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
            start: new UInt64(start),
            startParticipation: new UInt64(startParticipation),
            startFunding: new UInt64(startFunding),
            startRequesting: new UInt64(startRequesting),
        });

        let nextCampaignId = Field(0);
        const timelineTree = new TimelineStorage();
        const ipfsHashTree = new IpfsHashStorage();
        const keyTree = new KeyStorage();

        let tx = await Mina.transaction(senderAccount, () => {
            campaignContract.createCampaign(
                timeline,
                IpfsHash.fromString(CampaignMockData[0].ipfsHash),
                Field(CampaignMockData[0].committeeId),
                Field(CampaignMockData[0].keyId)
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
            keyTree.root,
            campaignContract.actionState.get()
        );

        proof = await RollupCampaign.createCampaignStep(
            proof,
            campaignAction,
            timelineTree.getLevel1Witness(nextCampaignId),
            ipfsHashTree.getLevel1Witness(nextCampaignId),
            keyTree.getLevel1Witness(nextCampaignId)
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
        keyTree.updateLeaf(
            nextCampaignId,
            KeyStorage.calculateLeaf({
                committeeId: campaignAction.committeeId,
                keyId: campaignAction.keyId,
            })
        );

        expect(timelineTree.root).toEqual(campaignContract.timelineRoot.get());
        expect(ipfsHashTree.root).toEqual(campaignContract.ipfsHashRoot.get());
        expect(keyTree.root).toEqual(campaignContract.keyRoot.get());

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

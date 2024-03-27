import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Group,
    Reducer,
    MerkleMapWitness,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    Void,
    Scalar,
    ZkProgram,
    Bool,
    UInt64,
    AccountUpdate,
} from 'o1js';
import {
    DefaultRootForZkAppTree,
    verifyZkApp,
    ZkAppRef,
} from '../storages/SharedStorage';
import { ZkAppEnum } from '../Constants';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import { FundingInformation } from '../storages/FundingStorage';
import {
    Storage,
    ZkApp as DkgZkApp,
    Constants as DkgConstants,
    RequestStatus,
} from '@auxo-dev/dkg';
import {
    Timeline,
    CampaignTimelineStateEnum,
    TimelineLevel1Witness,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage';
import { CampaignContract } from './Campaign';
import {
    CampaignStateEnum,
    CampaignStateLevel1Witness,
    ClaimedIndexLevel1Witness,
    ClaimedIndexStorage,
    DefaultRootForTreasuryManagerTree,
    TreasuryManagerActionEnum,
} from '../storages/TreasuryManagerStorage';
import { ProjectIndexLevel1Witness } from '../storages/ParticipationStorage';
import { TreasuryAddressLevel1Witness } from '../storages/ProjectStorage';
import { ParticipationContract } from './Participation';
import { ProjectContract } from './Project';

export { TreasuryManagerContract };

class TreasuryManagerAction extends Struct({
    campaignId: Field,
    projectIndex: Field,
    amount: UInt64,
    actionType: Field,
}) {
    getUniqueClaimedId() {
        return Poseidon.hash(
            [
                this.campaignId,
                this.projectIndex,
                this.amount.toFields(),
                Field(TreasuryManagerActionEnum.CLAIM_FUND),
            ].flat()
        );
    }

    getUniqueCompletedId() {
        return Poseidon.hash([
            this.campaignId,
            Field(TreasuryManagerActionEnum.COMPLETE_CAMPAIGN),
        ]);
    }

    getUniqueAbortedId() {
        return Poseidon.hash([
            this.campaignId,
            Field(TreasuryManagerActionEnum.ABORT_CAMPAIGN),
        ]);
    }
}

class TreasuryManagerContract extends SmartContract {
    @state(Field) campaignStateRoot = State<Field>();
    @state(Field) claimedIndexRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: TreasuryManagerAction });

    init(): void {
        super.init();
        this.campaignStateRoot.set(DefaultRootForCampaignTree);
        this.claimedIndexRoot.set(DefaultRootForTreasuryManagerTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method completeCampaign(
        campaignId: Field,
        requestId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        campaignStateWitness: CampaignStateLevel1Witness,
        taskWitness: Storage.RequestStorage.RequestLevel1Witness,
        expirationTimestamp: UInt64,
        expirationWitness: Storage.RequestStorage.RequestLevel1Witness,
        resultWitness: Storage.RequestStorage.RequestLevel1Witness,
        campaignContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef,
        requestContractRef: ZkAppRef
    ) {
        this.isNotEnded(campaignId, campaignStateWitness).assertTrue();

        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            campaignContractRef,
            zkAppRoot,
            Field(ZkAppEnum.CAMPAIGN)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );

        const campaignContract = new CampaignContract(
            campaignContractRef.address
        );
        campaignContract
            .getCampaignTimelineState(campaignId, timeline, timelineWitness)
            .assertEquals(Field(CampaignTimelineStateEnum.REQUESTING));

        const requestContract = new DkgZkApp.Request.RequestContract(
            requestContractRef.address
        );
        requestContract.verifyTaskId(
            requestId,
            requesterContractRef.address,
            campaignId,
            taskWitness
        );
        const requestStatus = requestContract.getRequestStatus(
            requestId,
            expirationTimestamp,
            expirationWitness,
            resultWitness
        );
        requestStatus.assertEquals(Field(RequestStatus.RESOLVED));

        // Check not exist complete action of this campaign
        const treasuryManagerAction = new TreasuryManagerAction({
            campaignId: campaignId,
            projectIndex: Field(0),
            amount: new UInt64(0),
            actionType: Field(TreasuryManagerActionEnum.COMPLETE_CAMPAIGN),
        });
        const actionState = this.actionState.getAndRequireEquals();
        const actions = this.reducer.getActions({
            fromActionState: actionState,
        });
        const { state: existed } = this.reducer.reduce(
            actions,
            Bool,
            (state: Bool, action: TreasuryManagerAction) => {
                return action
                    .getUniqueCompletedId()
                    .equals(treasuryManagerAction.getUniqueCompletedId())
                    .or(state);
            },
            // initial state
            { state: Bool(false), actionState: actionState }
        );
        existed.assertFalse();

        this.reducer.dispatch(treasuryManagerAction);
    }

    @method abortCampaign(
        campaignId: Field,
        requestId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        campaignStateWitness: CampaignStateLevel1Witness,
        taskWitness: Storage.RequestStorage.RequestLevel1Witness,
        expirationTimestamp: UInt64,
        expirationWitness: Storage.RequestStorage.RequestLevel1Witness,
        resultWitness: Storage.RequestStorage.RequestLevel1Witness,
        campaignContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef,
        requestContractRef: ZkAppRef
    ) {
        this.isNotEnded(campaignId, campaignStateWitness).assertTrue();

        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            campaignContractRef,
            zkAppRoot,
            Field(ZkAppEnum.CAMPAIGN)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );

        const campaignContract = new CampaignContract(
            campaignContractRef.address
        );
        campaignContract
            .getCampaignTimelineState(campaignId, timeline, timelineWitness)
            .assertEquals(Field(CampaignTimelineStateEnum.REQUESTING));

        const requestContract = new DkgZkApp.Request.RequestContract(
            requestContractRef.address
        );
        requestContract.verifyTaskId(
            requestId,
            requesterContractRef.address,
            campaignId,
            taskWitness
        );
        const requestStatus = requestContract.getRequestStatus(
            requestId,
            expirationTimestamp,
            expirationWitness,
            resultWitness
        );
        requestStatus.assertEquals(Field(RequestStatus.EXPIRED));

        // Check not exist abort campaign action of this campaign
        const treasuryManagerAction = new TreasuryManagerAction({
            campaignId: campaignId,
            projectIndex: Field(0),
            amount: new UInt64(0),
            actionType: Field(TreasuryManagerActionEnum.ABORT_CAMPAIGN),
        });
        const actionState = this.actionState.getAndRequireEquals();
        const actions = this.reducer.getActions({
            fromActionState: actionState,
        });
        const { state: existed } = this.reducer.reduce(
            actions,
            Bool,
            (state: Bool, action: TreasuryManagerAction) => {
                return action
                    .getUniqueAbortedId()
                    .equals(treasuryManagerAction.getUniqueAbortedId())
                    .or(state);
            },
            // initial state
            { state: Bool(false), actionState: actionState }
        );
        existed.assertFalse();

        this.reducer.dispatch(treasuryManagerAction);
    }

    @method claimFund(
        campaignId: Field,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        treasuryAddress: PublicKey,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        claimedIndexWitness: ClaimedIndexLevel1Witness,
        amount: UInt64,
        participationContractRef: ZkAppRef,
        requestContractRef: ZkAppRef,
        projectContractRef: ZkAppRef
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppEnum.PARTICIPATION)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUEST)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            projectContractRef,
            zkAppRoot,
            Field(ZkAppEnum.PROJECT)
        );

        const participationContract = new ParticipationContract(
            participationContractRef.address
        );
        participationContract
            .isValidProjectIndex(
                campaignId,
                projectId,
                projectIndex,
                projectIndexWitness
            )
            .assertTrue();
        const requestContract = new DkgZkApp.Request.RequestContract(
            requestContractRef.address
        );
        const dimensionIndex = projectIndex.sub(1);
        const result = CustomScalar.fromUInt64(amount);
        // Verify result right here

        const projectContract = new ProjectContract(projectContractRef.address);
        projectContract
            .isValidTreasuryAddress(
                projectId,
                treasuryAddress,
                treasuryAddressWitness
            )
            .assertTrue();

        this.isClaimed(
            campaignId,
            dimensionIndex,
            claimedIndexWitness
        ).assertFalse();

        // Check not exist action claim of this project in this campaign
        const treasuryManagerAction = new TreasuryManagerAction({
            campaignId: campaignId,
            projectIndex: projectIndex,
            amount: amount,
            actionType: Field(TreasuryManagerActionEnum.CLAIM_FUND),
        });
        const actionState = this.actionState.getAndRequireEquals();
        const actions = this.reducer.getActions({
            fromActionState: actionState,
        });
        const { state: existed } = this.reducer.reduce(
            actions,
            Bool,
            (state: Bool, action: TreasuryManagerAction) => {
                return action
                    .getUniqueClaimedId()
                    .equals(treasuryManagerAction.getUniqueClaimedId())
                    .or(state);
            },
            // initial state
            { state: Bool(false), actionState: actionState }
        );
        existed.assertFalse();

        const sender = AccountUpdate.createSigned(this.address);
        sender.send({ to: treasuryAddress, amount: amount });

        this.reducer.dispatch(treasuryManagerAction);
    }

    @method refund(
        fundingInformation: FundingInformation,
        campaignStateWitness: CampaignStateLevel1Witness,
        fundingContractRef: ZkAppRef
    ) {
        this.isAborted(
            fundingInformation.campaignId,
            campaignStateWitness
        ).assertTrue();
        // require call from FundingContract
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            fundingContractRef,
            zkAppRoot,
            Field(ZkAppEnum.FUNDING)
        );
        Utils.requireCaller(fundingContractRef.address, this);
        const sender = AccountUpdate.createSigned(this.address);
        sender.send({
            to: fundingInformation.investor,
            amount: fundingInformation.amount,
        });
    }

    @method rollup() {
        //
    }

    isNotEnded(
        campaignId: Field,
        campaignStateWitness: CampaignStateLevel1Witness
    ): Bool {
        return campaignStateWitness
            .calculateIndex()
            .equals(campaignId)
            .and(
                campaignStateWitness
                    .calculateRoot(Field(CampaignStateEnum.NOT_ENDED))
                    .equals(this.campaignStateRoot.getAndRequireEquals())
            );
    }

    isCompleted(
        campaignId: Field,
        campaignStateWitness: CampaignStateLevel1Witness
    ) {
        return campaignStateWitness
            .calculateIndex()
            .equals(campaignId)
            .and(
                campaignStateWitness
                    .calculateRoot(Field(CampaignStateEnum.COMPLETED))
                    .equals(this.campaignStateRoot.getAndRequireEquals())
            );
    }

    isAborted(
        campaignId: Field,
        campaignStateWitness: CampaignStateLevel1Witness
    ) {
        return campaignStateWitness
            .calculateIndex()
            .equals(campaignId)
            .and(
                campaignStateWitness
                    .calculateRoot(Field(CampaignStateEnum.ABORTED))
                    .equals(this.campaignStateRoot.getAndRequireEquals())
            );
    }

    isClaimed(
        campaignId: Field,
        dimensionIndex: Field,
        claimedIndexWitness: ClaimedIndexLevel1Witness
    ): Bool {
        return claimedIndexWitness
            .calculateIndex()
            .equals(
                ClaimedIndexStorage.calculateLevel1Index({
                    campaignId,
                    dimensionIndex,
                })
            )
            .and(
                claimedIndexWitness
                    .calculateRoot(
                        ClaimedIndexStorage.calculateLeaf(Bool(true))
                    )
                    .equals(this.claimedIndexRoot.getAndRequireEquals())
            );
    }
}

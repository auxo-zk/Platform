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
import { Utils } from '@auxo-dev/auxo-libs';
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
    actionType: Field,
}) {}

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
        this.reducer.dispatch(
            new TreasuryManagerAction({
                campaignId: campaignId,
                actionType: Field(TreasuryManagerActionEnum.COMPLETE_CAMPAIGN),
            })
        );
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
        this.reducer.dispatch(
            new TreasuryManagerAction({
                campaignId: campaignId,
                actionType: Field(TreasuryManagerActionEnum.ABORT_CAMPAIGN),
            })
        );
    }

    @method claimFund(
        campaignId: Field,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        treasuryAddress: PublicKey,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        claimedIndexWitness: ClaimedIndexLevel1Witness,
        participationContractRef: ZkAppRef,
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
            projectIndex.sub(1),
            claimedIndexWitness
        ).assertFalse();
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
        projectIndex: Field,
        claimedIndexWitness: ClaimedIndexLevel1Witness
    ): Bool {
        return claimedIndexWitness
            .calculateIndex()
            .equals(
                ClaimedIndexStorage.calculateLevel1Index({
                    campaignId,
                    projectIndex,
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

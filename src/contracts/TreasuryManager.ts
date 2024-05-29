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
    UInt8,
    UInt32,
    Permissions,
} from 'o1js';
import {
    DefaultRootForZkAppTree,
    verifyZkApp,
    ZkAppRef,
} from '../storages/SharedStorage.js';
import { MINIMAL_MINA_UNIT, ZkAppIndex } from '../Constants.js';
import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';
import { FundingInformation } from '../storages/FundingStorage.js';
import {
    Storage,
    ZkApp as DkgZkApp,
    Constants as DkgConstants,
    RequestStatus,
    RequestContract,
} from '@auxo-dev/dkg';
import {
    Timeline,
    CampaignTimelineStateEnum,
    TimelineLevel1Witness,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage.js';
import { CampaignContract, CampaignContractMock } from './Campaign.js';
import {
    CampaignStateEnum,
    CampaignStateLevel1Witness,
    CampaignStateStorage,
    ClaimedAmountLevel1Witness,
    ClaimedAmountStorage,
    DefaultRootForTreasuryManagerTree,
    TreasuryManagerActionEnum,
} from '../storages/TreasuryManagerStorage.js';
import { ProjectIndexLevel1Witness } from '../storages/ParticipationStorage.js';
import { TreasuryAddressLevel1Witness } from '../storages/ProjectStorage.js';
import {
    ParticipationContract,
    ParticipationContractMock,
} from './Participation.js';
import { ProjectContract } from './Project.js';

export {
    TreasuryManagerContract,
    TreasuryManagerContractMock,
    TreasuryManagerAction,
    RollupTreasuryManager,
    RollupTreasuryManagerOutput,
    RollupTreasuryManagerProof,
};

class TreasuryManagerAction extends Struct({
    campaignId: Field,
    projectIndex: Field,
    amount: UInt64,
    actionType: Field,
}) {
    static fromFields(fields: Field[]): TreasuryManagerAction {
        return super.fromFields(fields) as TreasuryManagerAction;
    }

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

class RollupTreasuryManagerOutput extends Struct({
    initialCampaignStateRoot: Field,
    initialClaimedAmountRoot: Field,
    initialActionState: Field,
    nextCampaignStateRoot: Field,
    nextClaimedAmountRoot: Field,
    nextActionState: Field,
}) {}

const RollupTreasuryManager = ZkProgram({
    name: 'RollupTreasuryManager',
    publicOutput: RollupTreasuryManagerOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field],
            async method(
                initialCampaignStateRoot: Field,
                initialClaimedAmountRoot: Field,
                initialActionState: Field
            ): Promise<RollupTreasuryManagerOutput> {
                return new RollupTreasuryManagerOutput({
                    initialCampaignStateRoot: initialCampaignStateRoot,
                    initialClaimedAmountRoot: initialClaimedAmountRoot,
                    initialActionState: initialActionState,
                    nextCampaignStateRoot: initialCampaignStateRoot,
                    nextClaimedAmountRoot: initialClaimedAmountRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        completeCampaignStep: {
            privateInputs: [
                SelfProof<Void, RollupTreasuryManagerOutput>,
                TreasuryManagerAction,
                CampaignStateLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupTreasuryManagerOutput>,
                treasuryManagerAction: TreasuryManagerAction,
                campaignStateWitness: CampaignStateLevel1Witness
            ): Promise<RollupTreasuryManagerOutput> {
                earlierProof.verify();
                treasuryManagerAction.actionType.assertEquals(
                    Field(TreasuryManagerActionEnum.COMPLETE_CAMPAIGN)
                );
                campaignStateWitness
                    .calculateIndex()
                    .assertEquals(treasuryManagerAction.campaignId);
                campaignStateWitness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextCampaignStateRoot
                    );
                const nextCampaignStateRoot =
                    campaignStateWitness.calculateRoot(
                        CampaignStateStorage.calculateLeaf(
                            CampaignStateEnum.COMPLETED
                        )
                    );
                return new RollupTreasuryManagerOutput({
                    initialCampaignStateRoot:
                        earlierProof.publicOutput.initialCampaignStateRoot,
                    initialClaimedAmountRoot:
                        earlierProof.publicOutput.initialClaimedAmountRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextCampaignStateRoot: nextCampaignStateRoot,
                    nextClaimedAmountRoot:
                        earlierProof.publicOutput.nextClaimedAmountRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [TreasuryManagerAction.toFields(treasuryManagerAction)]
                    ),
                });
            },
        },
        abortCampaignStep: {
            privateInputs: [
                SelfProof<Void, RollupTreasuryManagerOutput>,
                TreasuryManagerAction,
                CampaignStateLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupTreasuryManagerOutput>,
                treasuryManagerAction: TreasuryManagerAction,
                campaignStateWitness: CampaignStateLevel1Witness
            ): Promise<RollupTreasuryManagerOutput> {
                earlierProof.verify();
                treasuryManagerAction.actionType.assertEquals(
                    Field(TreasuryManagerActionEnum.ABORT_CAMPAIGN)
                );
                campaignStateWitness
                    .calculateIndex()
                    .assertEquals(treasuryManagerAction.campaignId);
                campaignStateWitness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextCampaignStateRoot
                    );
                const nextCampaignStateRoot =
                    campaignStateWitness.calculateRoot(
                        CampaignStateStorage.calculateLeaf(
                            CampaignStateEnum.ABORTED
                        )
                    );
                return new RollupTreasuryManagerOutput({
                    initialCampaignStateRoot:
                        earlierProof.publicOutput.initialCampaignStateRoot,
                    initialClaimedAmountRoot:
                        earlierProof.publicOutput.initialClaimedAmountRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextCampaignStateRoot: nextCampaignStateRoot,
                    nextClaimedAmountRoot:
                        earlierProof.publicOutput.nextClaimedAmountRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [TreasuryManagerAction.toFields(treasuryManagerAction)]
                    ),
                });
            },
        },
        claimFundStep: {
            privateInputs: [
                SelfProof<Void, RollupTreasuryManagerOutput>,
                TreasuryManagerAction,
                ClaimedAmountLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupTreasuryManagerOutput>,
                treasuryManagerAction: TreasuryManagerAction,
                claimedAmountWitness: ClaimedAmountLevel1Witness
            ): Promise<RollupTreasuryManagerOutput> {
                earlierProof.verify();
                treasuryManagerAction.actionType.assertEquals(
                    Field(TreasuryManagerActionEnum.CLAIM_FUND)
                );
                claimedAmountWitness.calculateIndex().assertEquals(
                    ClaimedAmountStorage.calculateLevel1Index({
                        campaignId: treasuryManagerAction.campaignId,
                        dimensionIndex: UInt8.from(
                            treasuryManagerAction.projectIndex.sub(1)
                        ),
                    })
                );
                claimedAmountWitness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextClaimedAmountRoot
                    );
                const nextClaimedAmountRoot =
                    claimedAmountWitness.calculateRoot(
                        ClaimedAmountStorage.calculateLeaf(
                            treasuryManagerAction.amount
                        )
                    );
                return new RollupTreasuryManagerOutput({
                    initialCampaignStateRoot:
                        earlierProof.publicOutput.initialCampaignStateRoot,
                    initialClaimedAmountRoot:
                        earlierProof.publicOutput.initialClaimedAmountRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextCampaignStateRoot:
                        earlierProof.publicOutput.nextCampaignStateRoot,
                    nextClaimedAmountRoot: nextClaimedAmountRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [TreasuryManagerAction.toFields(treasuryManagerAction)]
                    ),
                });
            },
        },
    },
});

class RollupTreasuryManagerProof extends ZkProgram.Proof(
    RollupTreasuryManager
) {}
class TreasuryManagerContract extends SmartContract {
    @state(Field) campaignStateRoot = State<Field>();
    @state(Field) claimedAmountRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: TreasuryManagerAction });

    init(): void {
        super.init();
        this.campaignStateRoot.set(DefaultRootForCampaignTree);
        this.claimedAmountRoot.set(DefaultRootForTreasuryManagerTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);

        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
    }

    @method async completeCampaign(
        campaignId: Field,
        requestId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        campaignStateWitness: CampaignStateLevel1Witness,
        taskIdWitness: Storage.RequestStorage.RequestLevel1Witness,
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
            Field(ZkAppIndex.CAMPAIGN)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );

        const campaignContract = new CampaignContract(
            campaignContractRef.address
        );
        // TEMP CHANGES
        campaignContract.getCampaignTimelineState(
            campaignId,
            timeline,
            timelineWitness
        );
        // .assertEquals(Field(CampaignTimelineStateEnum.REQUESTING));

        const requestContract = new RequestContract(requestContractRef.address);

        requestContract.verifyTaskId(
            requestId,
            requesterContractRef.address,
            UInt32.fromFields(campaignId.toFields()),
            taskIdWitness
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

    @method async abortCampaign(
        campaignId: Field,
        requestId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        campaignStateWitness: CampaignStateLevel1Witness,
        taskIdWitness: Storage.RequestStorage.RequestLevel1Witness,
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
            Field(ZkAppIndex.CAMPAIGN)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );

        const campaignContract = new CampaignContract(
            campaignContractRef.address
        );
        // TEMP CHANGES
        campaignContract.getCampaignTimelineState(
            campaignId,
            timeline,
            timelineWitness
        );
        // .assertEquals(Field(CampaignTimelineStateEnum.REQUESTING));

        const requestContract = new RequestContract(requestContractRef.address);
        requestContract.verifyTaskId(
            requestId,
            requesterContractRef.address,
            UInt32.fromFields(campaignId.toFields()),
            taskIdWitness
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

    @method async claimFund(
        campaignId: Field,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        requestId: Field,
        taskIdWitness: Storage.RequestStorage.RequestLevel1Witness,
        resultVectorWitness: Storage.RequestStorage.RequestLevel1Witness,
        resultValueWitness: Storage.RequestStorage.RequestLevel2Witness,
        treasuryAddress: PublicKey,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        claimedAmountWitness: ClaimedAmountLevel1Witness,
        amount: UInt64,
        participationContractRef: ZkAppRef,
        requestContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef,
        projectContractRef: ZkAppRef
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppIndex.PARTICIPATION)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            projectContractRef,
            zkAppRoot,
            Field(ZkAppIndex.PROJECT)
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
        const requestContract = new RequestContract(requestContractRef.address);
        const dimensionIndex = UInt8.from(projectIndex.sub(1));

        const result = CustomScalar.fromUInt64(amount).toScalar();
        // Verify result right here
        requestContract.verifyTaskId(
            requestId,
            requesterContractRef.address,
            UInt32.fromFields(campaignId.toFields()),
            taskIdWitness
        );
        requestContract.verifyResult(
            requestId,
            dimensionIndex,
            result,
            resultVectorWitness,
            resultValueWitness
        );

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
            claimedAmountWitness
        ).assertFalse();

        // Check not exist action claim of this project in this campaign
        const treasuryManagerAction = new TreasuryManagerAction({
            campaignId: campaignId,
            projectIndex: projectIndex,
            amount: amount.mul(MINIMAL_MINA_UNIT),
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

        this.send({
            to: AccountUpdate.create(treasuryAddress),
            amount: amount.mul(MINIMAL_MINA_UNIT),
        });

        this.reducer.dispatch(treasuryManagerAction);
    }

    @method async refund(
        fundingInformation: FundingInformation,
        campaignStateWitness: CampaignStateLevel1Witness,
        fundingContractRef: ZkAppRef
    ) {
        this.isAborted(
            fundingInformation.campaignId,
            campaignStateWitness
        ).assertTrue();
        // require call from FundingContract
        Utils.requireCaller(fundingContractRef.address, this);
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            fundingContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING)
        );
        this.send({
            to: AccountUpdate.create(fundingInformation.investor),
            amount: fundingInformation.amount,
        });
    }

    @method async rollup(
        rollupTreasuryManagerProof: RollupTreasuryManagerProof
    ) {
        const campaignStateRoot = this.campaignStateRoot.getAndRequireEquals();
        const claimedAmountRoot = this.claimedAmountRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        campaignStateRoot.assertEquals(
            rollupTreasuryManagerProof.publicOutput.initialCampaignStateRoot
        );
        claimedAmountRoot.assertEquals(
            rollupTreasuryManagerProof.publicOutput.initialClaimedAmountRoot
        );
        actionState.assertEquals(
            rollupTreasuryManagerProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(
                rollupTreasuryManagerProof.publicOutput.nextActionState
            );
        this.campaignStateRoot.set(
            rollupTreasuryManagerProof.publicOutput.nextCampaignStateRoot
        );
        this.claimedAmountRoot.set(
            rollupTreasuryManagerProof.publicOutput.nextClaimedAmountRoot
        );
        this.actionState.set(
            rollupTreasuryManagerProof.publicOutput.nextActionState
        );
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
        dimensionIndex: UInt8,
        claimedAmountWitness: ClaimedAmountLevel1Witness
    ): Bool {
        return claimedAmountWitness
            .calculateIndex()
            .equals(
                ClaimedAmountStorage.calculateLevel1Index({
                    campaignId,
                    dimensionIndex,
                })
            )
            .and(
                claimedAmountWitness
                    .calculateRoot(
                        ClaimedAmountStorage.calculateLeaf(new UInt64(0))
                    )
                    .equals(this.claimedAmountRoot.getAndRequireEquals())
                    .not()
            );
    }

    checkClaimedAmount(
        campaignId: Field,
        dimensionIndex: UInt8,
        claimedAmount: UInt64,
        claimedAmountWitness: ClaimedAmountLevel1Witness
    ): Bool {
        return claimedAmountWitness
            .calculateIndex()
            .equals(
                ClaimedAmountStorage.calculateLevel1Index({
                    campaignId,
                    dimensionIndex,
                })
            )
            .and(
                claimedAmountWitness
                    .calculateRoot(
                        ClaimedAmountStorage.calculateLeaf(claimedAmount)
                    )
                    .equals(this.claimedAmountRoot.getAndRequireEquals())
            );
    }
}

class TreasuryManagerContractMock extends SmartContract {
    @state(Field) campaignStateRoot = State<Field>();
    @state(Field) claimedAmountRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: TreasuryManagerAction });

    init(): void {
        super.init();
        this.campaignStateRoot.set(DefaultRootForCampaignTree);
        this.claimedAmountRoot.set(DefaultRootForTreasuryManagerTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);

        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
    }

    @method async completeCampaign(
        campaignId: Field,
        requestId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        campaignStateWitness: CampaignStateLevel1Witness,
        // requesterAddressWitness: Storage.RequestStorage.RequestLevel1Witness,
        expirationTimestamp: UInt64,
        // expirationWitness: Storage.RequestStorage.RequestLevel1Witness,
        // resultWitness: Storage.RequestStorage.RequestLevel1Witness,
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
            Field(ZkAppIndex.CAMPAIGN)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );

        const campaignContract = new CampaignContractMock(
            campaignContractRef.address
        );
        // TEMP CHANGES
        campaignContract.getCampaignTimelineState(
            campaignId,
            timeline,
            timelineWitness
        );
        // .assertEquals(Field(CampaignTimelineStateEnum.REQUESTING));

        // const requestContract = new DkgZkApp.Request.RequestContract(
        //     requestContractRef.address
        // );
        // requestContract.verifyTaskId(
        //     requestId,
        //     requesterContractRef.address,
        //     UInt32.fromFields(campaignId.toFields()),
        //     requesterAddressWitness
        // );
        // const requestStatus = requestContract.getRequestStatus(
        //     requestId,
        //     expirationTimestamp,
        //     expirationWitness,
        //     resultWitness
        // );
        const requestStatus = Field(RequestStatus.RESOLVED);
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

    @method async abortCampaign(
        campaignId: Field,
        requestId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        campaignStateWitness: CampaignStateLevel1Witness,
        // taskIdWitness: Storage.RequestStorage.RequestLevel1Witness,
        expirationTimestamp: UInt64,
        // expirationWitness: Storage.RequestStorage.RequestLevel1Witness,
        // resultWitness: Storage.RequestStorage.RequestLevel1Witness,
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
            Field(ZkAppIndex.CAMPAIGN)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );

        const campaignContract = new CampaignContractMock(
            campaignContractRef.address
        );
        // TEMP CHANGES
        campaignContract.getCampaignTimelineState(
            campaignId,
            timeline,
            timelineWitness
        );
        // .assertEquals(Field(CampaignTimelineStateEnum.REQUESTING));

        // const requestContract = new DkgZkApp.Request.RequestContract(
        //     requestContractRef.address
        // );
        // requestContract.verifyTaskId(
        //     requestId,
        //     requesterContractRef.address,
        //     UInt32.fromFields(campaignId.toFields()),
        //     requesterAddressWitness
        // );
        // const requestStatus = requestContract.getRequestStatus(
        //     requestId,
        //     expirationTimestamp,
        //     expirationWitness,
        //     resultWitness
        // );
        const requestStatus = Field(RequestStatus.EXPIRED);
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

    @method async claimFund(
        campaignId: Field,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        requestId: Field,
        // taskIdWitness: Storage.RequestStorage.RequestLevel1Witness,
        // resultVectorWitness: Storage.RequestStorage.RequestLevel1Witness,
        // resultValueWitness: Storage.RequestStorage.RequestLevel2Witness,
        treasuryAddress: PublicKey,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        claimedAmountWitness: ClaimedAmountLevel1Witness,
        amount: UInt64,
        participationContractRef: ZkAppRef,
        requestContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef,
        projectContractRef: ZkAppRef
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppIndex.PARTICIPATION)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            TreasuryManagerContract.name,
            projectContractRef,
            zkAppRoot,
            Field(ZkAppIndex.PROJECT)
        );

        const participationContract = new ParticipationContractMock(
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
        // const requestContract = new DkgZkApp.Request.RequestContract(
        //     requestContractRef.address
        // );
        const dimensionIndex = UInt8.from(projectIndex.sub(1));

        const result = CustomScalar.fromUInt64(amount).toScalar();
        // Verify result right here
        // requestContract.verifyTaskId(
        //     requestId,
        //     requesterContractRef.address,
        //     UInt32.fromFields(campaignId.toFields()),
        //     requesterAddressWitness
        // );
        // requestContract.verifyResult(
        //     requestId,
        //     dimensionIndex,
        //     result,
        //     resultVectorWitness,
        //     resultValueWitness
        // );

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
            claimedAmountWitness
        ).assertFalse();

        // Check not exist action claim of this project in this campaign
        const treasuryManagerAction = new TreasuryManagerAction({
            campaignId: campaignId,
            projectIndex: projectIndex,
            amount: amount.mul(MINIMAL_MINA_UNIT),
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

        this.send({
            to: AccountUpdate.create(treasuryAddress),
            amount: amount.mul(MINIMAL_MINA_UNIT),
        });

        this.reducer.dispatch(treasuryManagerAction);
    }

    @method async refund(
        fundingInformation: FundingInformation,
        campaignStateWitness: CampaignStateLevel1Witness,
        fundingContractRef: ZkAppRef
    ) {
        this.isAborted(
            fundingInformation.campaignId,
            campaignStateWitness
        ).assertTrue();
        // require call from FundingContract
        Utils.requireCaller(fundingContractRef.address, this);
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            TreasuryManagerContract.name,
            fundingContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING)
        );
        this.send({
            to: AccountUpdate.create(fundingInformation.investor),
            amount: fundingInformation.amount,
        });
    }

    @method async rollup(
        rollupTreasuryManagerProof: RollupTreasuryManagerProof
    ) {
        const campaignStateRoot = this.campaignStateRoot.getAndRequireEquals();
        const claimedAmountRoot = this.claimedAmountRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        campaignStateRoot.assertEquals(
            rollupTreasuryManagerProof.publicOutput.initialCampaignStateRoot
        );
        claimedAmountRoot.assertEquals(
            rollupTreasuryManagerProof.publicOutput.initialClaimedAmountRoot
        );
        actionState.assertEquals(
            rollupTreasuryManagerProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(
                rollupTreasuryManagerProof.publicOutput.nextActionState
            );
        this.campaignStateRoot.set(
            rollupTreasuryManagerProof.publicOutput.nextCampaignStateRoot
        );
        this.claimedAmountRoot.set(
            rollupTreasuryManagerProof.publicOutput.nextClaimedAmountRoot
        );
        this.actionState.set(
            rollupTreasuryManagerProof.publicOutput.nextActionState
        );
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
        dimensionIndex: UInt8,
        claimedAmountWitness: ClaimedAmountLevel1Witness
    ): Bool {
        return claimedAmountWitness
            .calculateIndex()
            .equals(
                ClaimedAmountStorage.calculateLevel1Index({
                    campaignId,
                    dimensionIndex,
                })
            )
            .and(
                claimedAmountWitness
                    .calculateRoot(
                        ClaimedAmountStorage.calculateLeaf(new UInt64(0))
                    )
                    .equals(this.claimedAmountRoot.getAndRequireEquals())
                    .not()
            );
    }
}

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

import { CustomScalar, ScalarDynamicArray } from '@auxo-dev/auxo-libs';

import { ZkApp as DkgZkApp, Constants as DkgConstants } from '@auxo-dev/dkg';

import { INSTANCE_LIMITS, ZkAppEnum } from '../Constants.js';

import {
    ZkAppRef,
    ZkAppAddressStorage,
    DefaultRootForZkAppTree,
    verifyZkApp,
} from '../storages/SharedStorage.js';

import {
    ScalarVector,
    GroupVector,
    getCommitmentHash,
    DefaultRootForCommitmentHashTree,
    Level1CHMT,
    Level1CHWitness,
    Level1Witness,
    TotalRStorage,
    TotalMStorage,
    TotalAmountStorage,
} from '../storages/FundingStorage.js';
import {
    CampaignTimelineStateEnum,
    Timeline,
    Level1Witness as TimelineLevel1Witness,
    Level1Witness as KeyLevel1Witness,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage.js';
import {
    Level1CWitness as ProjectIndexLevel1Witness,
    Level1Witness as ProjectCounterLevel1Witness,
} from '../storages/ParticipationStorage.js';
import { CampaignContract } from './Campaign-clone.js';
import { ParticipationContract } from './Participation-clone.js';
import { updateActionState } from '../libs/utils.js';

export class FundingAction extends Struct({
    campaignId: Field,
    amount: UInt64,
    commitmentHash: Field,
    R: GroupVector,
    M: GroupVector,
    timestamp: UInt64,
}) {}

export class RollupFundingOutput extends Struct({
    initialCommitmentHashId: Field,
    initialCommitmentHashRoot: Field,
    initialTotalRRoot: Field,
    initialTotalMRoot: Field,
    initialTotalAmountRoot: Field,
    initialActionState: Field,
    nextCommitmentHashId: Field,
    nextCommitmentHashRoot: Field,
    nextTotalRRoot: Field,
    nextTotalMRoot: Field,
    nextTotalAmountRoot: Field,
    nextActionState: Field,
}) {}

export const RollupFunding = ZkProgram({
    name: 'RollupFunding',
    publicOutput: RollupFundingOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field, Field, Field],
            method(
                initialCommitmentHashId: Field,
                initialCommitmentHashRoot: Field,
                initialTotalRRoot: Field,
                initialTotalMRoot: Field,
                initialTotalAmountRoot: Field,
                initialActionState: Field
            ) {
                return new RollupFundingOutput({
                    initialCommitmentHashId: initialCommitmentHashId,
                    initialCommitmentHashRoot: initialCommitmentHashRoot,
                    initialTotalRRoot: initialTotalRRoot,
                    initialTotalMRoot: initialTotalMRoot,
                    initialTotalAmountRoot: initialTotalAmountRoot,
                    initialActionState: initialActionState,
                    nextCommitmentHashId: initialCommitmentHashId,
                    nextCommitmentHashRoot: initialCommitmentHashRoot,
                    nextTotalRRoot: initialTotalRRoot,
                    nextTotalMRoot: initialTotalMRoot,
                    nextTotalAmountRoot: initialTotalAmountRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<Void, RollupFundingOutput>,
                FundingAction,
                Level1CHWitness,
                GroupVector,
                Level1Witness,
                GroupVector,
                Level1Witness,
                Field,
                Level1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupFundingOutput>,
                fundingAction: FundingAction,
                commitmentHashWitness: Level1CHWitness,
                currentTotalR: GroupVector,
                totalRWitness: Level1Witness,
                currentTotalM: GroupVector,
                totalMWitness: Level1Witness,
                currentTotalAmount: Field,
                totalAmountWitness: Level1Witness
            ) {
                earlierProof.verify();
                commitmentHashWitness
                    .calculateIndex()
                    .assertEquals(
                        earlierProof.publicOutput.nextCommitmentHashId
                    );
                commitmentHashWitness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextCommitmentHashRoot
                    );

                totalRWitness
                    .calculateIndex()
                    .assertEquals(fundingAction.campaignId);
                totalRWitness
                    .calculateRoot(TotalRStorage.calculateLeaf(currentTotalR))
                    .assertEquals(earlierProof.publicOutput.nextTotalRRoot);

                totalMWitness
                    .calculateIndex()
                    .assertEquals(fundingAction.campaignId);
                totalMWitness
                    .calculateRoot(TotalMStorage.calculateLeaf(currentTotalM))
                    .assertEquals(earlierProof.publicOutput.nextTotalMRoot);

                totalAmountWitness
                    .calculateIndex()
                    .assertEquals(fundingAction.campaignId);
                totalAmountWitness
                    .calculateRoot(
                        TotalAmountStorage.calculateLeaf(currentTotalAmount)
                    )
                    .assertEquals(
                        earlierProof.publicOutput.nextTotalAmountRoot
                    );

                const nextCommitmentHashRoot =
                    commitmentHashWitness.calculateRoot(
                        fundingAction.commitmentHash
                    );
                const nextTotalR = new GroupVector();
                const nextTotalM = new GroupVector();
                for (
                    let i = 0;
                    i < INSTANCE_LIMITS.PARTICIPATION_SLOT_TREE_SIZE;
                    i++
                ) {
                    nextTotalR.push(
                        currentTotalR.values[i].add(fundingAction.R.values[i])
                    );
                    nextTotalM.push(
                        currentTotalM.values[i].add(fundingAction.M.values[i])
                    );
                }
                const nextTotalRRoot = totalRWitness.calculateRoot(
                    TotalRStorage.calculateLeaf(nextTotalR)
                );
                const nextTotalMRoot = totalMWitness.calculateRoot(
                    TotalMStorage.calculateLeaf(nextTotalM)
                );
                const nextTotalAmountRoot = totalAmountWitness.calculateRoot(
                    currentTotalAmount.add(
                        Field.fromFields(fundingAction.amount.toFields())
                    )
                );
                return new RollupFundingOutput({
                    initialCommitmentHashId:
                        earlierProof.publicOutput.initialCommitmentHashId,
                    initialCommitmentHashRoot:
                        earlierProof.publicOutput.initialCommitmentHashRoot,
                    initialTotalRRoot:
                        earlierProof.publicOutput.initialTotalRRoot,
                    initialTotalMRoot:
                        earlierProof.publicOutput.initialTotalMRoot,
                    initialTotalAmountRoot:
                        earlierProof.publicOutput.initialTotalAmountRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextCommitmentHashId:
                        earlierProof.publicOutput.nextCommitmentHashId.add(1),
                    nextCommitmentHashRoot: nextCommitmentHashRoot,
                    nextTotalRRoot: nextTotalRRoot,
                    nextTotalMRoot: nextTotalMRoot,
                    nextTotalAmountRoot: nextTotalAmountRoot,
                    nextActionState: updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [FundingAction.toFields(fundingAction)]
                    ),
                });
            },
        },
    },
});

export class RollupFundingProof extends ZkProgram.Proof(RollupFunding) {}

export class FundingContract extends SmartContract {
    @state(Field) nextCommitmentHashId = State<Field>();
    @state(Field) commitmentHashRoot = State<Field>();
    @state(Field) totalRRoot = State<Field>();
    @state(Field) totalMRoot = State<Field>();
    @state(Field) totalAmountRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: FundingAction });

    init(): void {
        super.init();
        this.nextCommitmentHashId.set(Field(0));
        this.commitmentHashRoot.set(DefaultRootForCommitmentHashTree);
        this.totalRRoot.set(DefaultRootForCampaignTree);
        this.totalMRoot.set(DefaultRootForCampaignTree);
        this.totalAmountRoot.set(DefaultRootForCampaignTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method fund(
        campaignId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        dkgContractRef: ZkAppRef,
        campaignContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        treasuryContractRef: ZkAppRef,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        projectCounter: Field,
        projectCounterWitness: ProjectCounterLevel1Witness,
        committeeId: Field,
        keyId: Field,
        keyWitness: KeyLevel1Witness,
        key: PublicKey,
        amount: UInt64,
        randomVector: ScalarVector,
        commitmentHash: Field,
        nullifier: Field
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        // Check Treasury contract
        verifyZkApp(
            FundingContract.name,
            treasuryContractRef,
            zkAppRoot,
            Field(ZkAppEnum.TREASURY)
        );
        // Check Dkg contract
        verifyZkApp(
            FundingContract.name,
            dkgContractRef,
            zkAppRoot,
            Field(ZkAppEnum.DKG)
        );
        // Should check valid of key right here
        // Check Campaign contract
        verifyZkApp(
            FundingContract.name,
            campaignContractRef,
            zkAppRoot,
            Field(ZkAppEnum.CAMPAIGN)
        );
        const campaignContract = new CampaignContract(
            campaignContractRef.address
        );
        campaignContract
            .getCampaignTimelineState(campaignId, timeline, timelineWitness)
            .assertEquals(Field(CampaignTimelineStateEnum.FUNDING));
        campaignContract
            .isValidKey(campaignId, committeeId, keyId, keyWitness)
            .assertTrue();
        // Check Participation contract
        verifyZkApp(
            FundingContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppEnum.PARTICIPATION)
        );
        const participationContract = new ParticipationContract(
            participationContractRef.address
        );
        participationContract
            .hasValidActionStateForFunding(timeline)
            .assertTrue();
        participationContract.isValidProjectIndex(
            campaignId,
            projectId,
            projectIndex,
            projectIndexWitness
        );
        participationContract.isValidProjectCounter(
            campaignId,
            projectCounter,
            projectCounterWitness
        );

        const publicKey = key.toGroup();
        const R = new GroupVector();
        const M = new GroupVector();

        for (let i = 0; i < INSTANCE_LIMITS.PARTICIPATION_SLOT_TREE_SIZE; i++) {
            const index = Field(i);
            R.set(
                index,
                Group.generator.scale(randomVector.get(index).toScalar())
            );
            const base = publicKey.scale(randomVector.get(index).toScalar());
            M.set(
                index,
                Provable.if(
                    projectIndex.sub(1).equals(index),
                    base.add(
                        Group.generator.scale(
                            CustomScalar.fromUInt64(amount).toScalar()
                        )
                    ),
                    base.add(Group.generator)
                )
            );
        }

        commitmentHash.assertEquals(
            getCommitmentHash(nullifier, projectId, amount)
        );
        const investor = AccountUpdate.createSigned(this.sender);
        investor.send({
            to: AccountUpdate.create(treasuryContractRef.address),
            amount: amount,
        });
        this.reducer.dispatch(
            new FundingAction({
                campaignId: campaignId,
                amount: amount,
                commitmentHash: commitmentHash,
                R: R,
                M: M,
                timestamp: this.network.timestamp.getAndRequireEquals(),
            })
        );
    }

    @method rollup(rollupFundingProof: RollupFundingProof) {
        rollupFundingProof.verify();
        const nextCommitmentHashId =
            this.nextCommitmentHashId.getAndRequireEquals();
        const commitmentHashRoot =
            this.commitmentHashRoot.getAndRequireEquals();
        const totalRRoot = this.totalRRoot.getAndRequireEquals();
        const totalMRoot = this.totalMRoot.getAndRequireEquals();
        const totalAmountRoot = this.totalAmountRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();
        nextCommitmentHashId.assertEquals(
            rollupFundingProof.publicOutput.initialCommitmentHashId
        );
        commitmentHashRoot.assertEquals(
            rollupFundingProof.publicOutput.initialCommitmentHashRoot
        );
        totalRRoot.assertEquals(
            rollupFundingProof.publicOutput.initialTotalRRoot
        );
        totalMRoot.assertEquals(
            rollupFundingProof.publicOutput.initialTotalMRoot
        );
        totalAmountRoot.assertEquals(
            rollupFundingProof.publicOutput.initialTotalAmountRoot
        );
        actionState.assertEquals(
            rollupFundingProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(rollupFundingProof.publicOutput.nextActionState);
        this.nextCommitmentHashId.set(
            rollupFundingProof.publicOutput.nextCommitmentHashId
        );
        this.commitmentHashRoot.set(
            rollupFundingProof.publicOutput.nextCommitmentHashRoot
        );
        this.totalRRoot.set(rollupFundingProof.publicOutput.nextTotalRRoot);
        this.totalMRoot.set(rollupFundingProof.publicOutput.nextTotalMRoot);
        this.totalAmountRoot.set(
            rollupFundingProof.publicOutput.nextTotalAmountRoot
        );
        this.actionState.set(rollupFundingProof.publicOutput.nextActionState);
    }

    hasValidActionStateForRequest(timeline: Timeline): Bool {
        const actionState = this.actionState.getAndRequireEquals();
        const actions = this.reducer.getActions({
            fromActionState: actionState,
        });

        return this.reducer.reduce(
            actions.slice(0, 1),
            Bool,
            (state: Bool, action: FundingAction) => {
                return state.and(
                    action.timestamp.greaterThan(timeline.startRequest)
                );
            },
            {
                state: Bool(true),
                actionState: actionState,
            }
        ).state;
    }
}

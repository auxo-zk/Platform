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
import { updateOutOfSnark } from '../libs/utils.js';

import {
    ZkApp as DKG_Contracts,
    Constants as DKG_Constants,
} from '@auxo-dev/dkg';

import { ZkAppEnum } from '../constants.js';

import { ActionStatus, ZkAppRef, EMPTY_REDUCE_MT } from './SharedStorage.js';

import {
    Level1Witness,
    EMPTY_LEVEL_1_TREE,
    ValueStorage,
    RequestIdStorage,
    TotalFundStorage,
} from './FundingStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export enum EventEnum {
    ACTIONS_REDUCED = 'actions-reduced',
    REQUEST_SENT = 'request-sent',
}

export class RequestSent extends Struct({
    campaignId: Field,
    committeeId: Field,
    keyId: Field,
    requestId: Field,
    sumR: DKG_Contracts.Request.RequestVector,
    sumM: DKG_Contracts.Request.RequestVector,
    totalFundAmount: Field,
}) {
    static fromFields(action: Field[]): RequestSent {
        return super.fromFields(action) as RequestSent;
    }
}

export class CustomScalarArray extends ScalarDynamicArray(
    DKG_Constants.REQUEST_MAX_SIZE
) {}

export class FundingInput extends Struct({
    campaignId: Field,
    committeePublicKey: PublicKey,
    // TODO wintess to check if it the right publickey
    secretVector: CustomScalarArray,
    random: CustomScalarArray,
    // settingMerkleMapWitness: MerkleMapWitness,
    treasuryContract: ZkAppRef,
}) {}

export class FundingAction extends Struct({
    campaignId: Field,
    R: DKG_Contracts.Request.RequestVector,
    M: DKG_Contracts.Request.RequestVector,
    fundAmount: Field,
}) {
    hash(): Field {
        return Poseidon.hash(FundingAction.toFields(this));
    }

    static fromFields(action: Field[]): FundingAction {
        return super.fromFields(action) as FundingAction;
    }
}

export class CheckValueInput extends Struct({
    campaignId: Field,
    Value: DKG_Contracts.Request.RequestVector,
}) {}

export class ReduceOutput extends Struct({
    // Actually don't need initialActionState, since we check initialActionStatus and finalActionState on-chain
    // Do this to increase security: from finding x,y that hash(x,y) = Z to finding x that hash(x,Y) = Z
    initialActionState: Field,
    initialActionStatus: Field,
    finalActionState: Field,
    finalActionStatus: Field,
}) {}

export const CreateReduceProof = ZkProgram({
    name: 'create-rollup-status',
    publicOutput: ReduceOutput,
    methods: {
        // First action to rollup
        firstStep: {
            privateInputs: [Field, Field],
            method(
                initialActionState: Field,
                initialActionStatus: Field
            ): ReduceOutput {
                return new ReduceOutput({
                    initialActionState,
                    initialActionStatus,
                    finalActionState: initialActionState,
                    finalActionStatus: initialActionStatus,
                });
            },
        },
        // Next actions to rollup
        nextStep: {
            privateInputs: [
                SelfProof<Void, ReduceOutput>,
                FundingAction,
                MerkleMapWitness,
            ],
            method(
                earlierProof: SelfProof<Void, ReduceOutput>,
                action: FundingAction,
                rollupStatusWitness: MerkleMapWitness
            ): ReduceOutput {
                // Verify earlier proof
                earlierProof.verify();

                // Calculate new action state == action id in the tree
                let newActionState = updateOutOfSnark(
                    earlierProof.publicOutput.finalActionState,
                    [FundingAction.toFields(action)]
                );

                // Current value of the action hash should be NOT_EXISTED
                let [root, key] = rollupStatusWitness.computeRootAndKey(
                    Field(ActionStatus.NOT_EXISTED)
                );
                key.assertEquals(newActionState);
                root.assertEquals(earlierProof.publicOutput.finalActionStatus);

                // New value of the action hash = REDUCED
                [root] = rollupStatusWitness.computeRootAndKey(
                    Field(ActionStatus.REDUCED)
                );

                return new ReduceOutput({
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    initialActionStatus:
                        earlierProof.publicOutput.initialActionStatus,
                    finalActionState: newActionState,
                    finalActionStatus: root,
                });
            },
        },
    },
});
export class ReduceProof extends ZkProgram.Proof(CreateReduceProof) {}

export class RollupActionsOutput extends Struct({
    campaignId: Field,
    sum_R: DKG_Contracts.Request.RequestVector,
    sum_M: DKG_Contracts.Request.RequestVector,
    totalFundAmount: Field,
    initialStatusRoot: Field,
}) {
    hash(): Field {
        return Poseidon.hash(RollupActionsOutput.toFields(this));
    }
}

export const CreateRollupProof = ZkProgram({
    name: 'rollup-actions',
    publicOutput: RollupActionsOutput,
    methods: {
        nextStep: {
            privateInputs: [
                SelfProof<Void, RollupActionsOutput>,
                FundingAction,
                Field,
                MerkleMapWitness,
            ],

            method(
                preProof: SelfProof<Void, RollupActionsOutput>,
                action: FundingAction,
                preActionState: Field,
                rollupStatusWitness: MerkleMapWitness
            ): RollupActionsOutput {
                preProof.verify();
                let campaignId = action.campaignId;
                campaignId.assertEquals(preProof.publicOutput.campaignId);

                let actionState = updateOutOfSnark(preActionState, [
                    FundingAction.toFields(action),
                ]);

                // It's status has to be REDUCED
                let [root, key] = rollupStatusWitness.computeRootAndKey(
                    Field(ActionStatus.REDUCED)
                );
                key.assertEquals(actionState);
                root.assertEquals(preProof.publicOutput.initialStatusRoot);

                let sum_R = preProof.publicOutput.sum_R;
                let sum_M = preProof.publicOutput.sum_M;

                for (let i = 0; i < DKG_Constants.REQUEST_MAX_SIZE; i++) {
                    sum_R.set(
                        Field(i),
                        sum_R.get(Field(i)).add(action.R.get(Field(i)))
                    );
                    sum_M.set(
                        Field(i),
                        sum_M.get(Field(i)).add(action.M.get(Field(i)))
                    );
                }

                let newTotalFund = preProof.publicOutput.totalFundAmount.add(
                    action.fundAmount
                );

                return new RollupActionsOutput({
                    campaignId: campaignId,
                    sum_R,
                    sum_M,
                    totalFundAmount: newTotalFund,
                    initialStatusRoot: preProof.publicOutput.initialStatusRoot,
                });
            },
        },

        firstStep: {
            privateInputs: [Field, Field, Field],

            method(
                campaignId: Field,
                maxInvestorSize: Field,
                initialStatusRoot: Field
            ): RollupActionsOutput {
                return new RollupActionsOutput({
                    campaignId,
                    sum_R: DKG_Contracts.Request.RequestVector.empty(
                        maxInvestorSize
                    ),
                    sum_M: DKG_Contracts.Request.RequestVector.empty(
                        maxInvestorSize
                    ),
                    totalFundAmount: Field(0),
                    initialStatusRoot,
                });
            },
        },
    },
});

export class ProofRollupAction extends ZkProgram.Proof(CreateRollupProof) {}

export class FundingContract extends SmartContract {
    @state(Field) actionState = State<Field>();
    @state(Field) actionStatus = State<Field>();
    @state(Field) R_root = State<Field>(); // campaignId -> sum R
    @state(Field) M_root = State<Field>(); // campaignId -> sum M
    @state(Field) totalFundAmount_root = State<Field>(); // campaignId -> total fubnd amount
    @state(Field) requestId_root = State<Field>(); // campaignId -> requestId
    @state(Field) zkApps = State<Field>();

    reducer = Reducer({ actionType: FundingAction });
    events = {
        [EventEnum.ACTIONS_REDUCED]: Field,
        [EventEnum.REQUEST_SENT]: RequestSent,
    };

    init() {
        super.init();
        this.actionState.set(Reducer.initialActionState);
        this.actionStatus.set(EMPTY_REDUCE_MT().getRoot());
        this.R_root.set(DefaultLevel1Root);
        this.M_root.set(DefaultLevel1Root);
        this.totalFundAmount_root.set(DefaultLevel1Root);
        this.requestId_root.set(DefaultLevel1Root);
    }

    @method fund(fundingInput: FundingInput): {
        R: DKG_Contracts.Request.RequestVector;
        M: DKG_Contracts.Request.RequestVector;
    } {
        // TODO: change dimension to fixed size
        let dimension = fundingInput.secretVector.length;
        let R = new DKG_Contracts.Request.RequestVector();
        let M = new DKG_Contracts.Request.RequestVector();
        // TODO: remove provable witness
        let totalMinaInvest = Provable.witness(Field, () => {
            let curSum = 0n;
            for (let i = 0; i < dimension.toBigInt(); i++) {
                curSum += fundingInput.secretVector
                    .get(Field(i))
                    .toScalar()
                    .toBigInt();
            }
            return Field(curSum);
        });
        for (let i = 0; i < DKG_Constants.REQUEST_MAX_SIZE; i++) {
            let random = fundingInput.random.get(Field(i)).toScalar();
            R.push(
                Provable.if(
                    Field(i).greaterThanOrEqual(dimension),
                    Group.fromFields([Field(0), Field(0)]),
                    Group.generator.scale(random)
                )
            );
            // Trick to avoiding scale zero vector

            let tempSecretScalar = Provable.if(
                fundingInput.secretVector
                    .get(Field(i))
                    .equals(CustomScalar.fromScalar(Scalar.from(0n))),
                CustomScalar,
                CustomScalar.fromScalar(Scalar.from(69n)), // if equal zero
                fundingInput.secretVector.get(Field(i))
            );

            let M_i = Provable.if(
                Poseidon.hash(
                    fundingInput.secretVector.get(Field(i)).toFields()
                ).equals(Poseidon.hash([Field(0), Field(0)])),
                Group.zero.add(
                    fundingInput.committeePublicKey.toGroup().scale(random)
                ),
                Group.generator
                    .scale(tempSecretScalar.toScalar())
                    .add(
                        fundingInput.committeePublicKey.toGroup().scale(random)
                    )
            );

            M_i = Provable.if(
                Field(i)
                    .greaterThanOrEqual(dimension)
                    .or(
                        tempSecretScalar.equals(
                            CustomScalar.fromScalar(Scalar.from(69n))
                        ) // if secret value equal zero then M_i is zero
                    ),
                Group.fromFields([Field(0), Field(0)]),
                M_i
            );
            M.push(M_i);
        }
        let dercementAmount = Field(DKG_Constants.REQUEST_MAX_SIZE).sub(
            dimension
        );
        R.decrementLength(dercementAmount);
        M.decrementLength(dercementAmount);

        // Verify zkApp references
        let zkApps = this.zkApps.getAndRequireEquals();

        // TreasuryContract
        zkApps.assertEquals(
            fundingInput.treasuryContract.witness.calculateRoot(
                Poseidon.hash(fundingInput.treasuryContract.address.toFields())
            )
        );
        Field(ZkAppEnum.TREASURY).assertEquals(
            fundingInput.treasuryContract.witness.calculateIndex()
        );

        let investor = AccountUpdate.createSigned(this.sender);
        // Send invest Mina to treasury contract
        investor.send({
            to: AccountUpdate.create(fundingInput.treasuryContract.address),
            amount: UInt64.from(totalMinaInvest),
        });

        this.reducer.dispatch(
            new FundingAction({
                campaignId: fundingInput.campaignId,
                R,
                M,
                fundAmount: totalMinaInvest,
            })
        );

        return { R, M };
    }

    @method reduce(proof: ReduceProof) {
        // Verify proof
        proof.verify();

        // assert initialActionState
        let actionState = this.actionState.getAndRequireEquals();
        proof.publicOutput.initialActionState.assertEquals(actionState);

        // assert initialActionStatus
        let actionStatus = this.actionStatus.getAndRequireEquals();
        proof.publicOutput.initialActionStatus.assertEquals(actionStatus);

        // assert finalActionState
        let lastActionState = this.account.actionState.getAndRequireEquals();
        lastActionState.assertEquals(proof.publicOutput.finalActionState);

        this.actionState.set(lastActionState);
        this.actionStatus.set(proof.publicOutput.finalActionStatus);

        // Emit events
        this.emitEvent(EventEnum.ACTIONS_REDUCED, lastActionState);
    }

    // TODO: add time condition to check rollup
    // TODO: adding N, T to check REQUEST_MAX_SIZE by interact with Committee contract (???)
    // TODO: checking Campaign contract config -> committeeId and keyId is valid
    @method rollupRequest(
        proof: ProofRollupAction,
        committeeId: Field,
        keyId: Field,
        R_witness: Level1Witness,
        M_witness: Level1Witness,
        totalFundAmount_witness: Level1Witness,
        requestId_witness: Level1Witness,
        requestZkAppRef: ZkAppRef
    ) {
        proof.verify();

        let requestInput = new DKG_Contracts.Request.RequestInput({
            committeeId,
            keyId,
            R: proof.publicOutput.sum_R,
        });

        let requestId = requestInput.requestId();

        let R_root = this.R_root.getAndRequireEquals();
        let M_root = this.M_root.getAndRequireEquals();
        let requestId_root = this.requestId_root.getAndRequireEquals();
        let totalFundAmount_root =
            this.totalFundAmount_root.getAndRequireEquals();
        let actionStatus = this.actionStatus.getAndRequireEquals();

        actionStatus.assertEquals(proof.publicOutput.initialStatusRoot);

        let R_key = R_witness.calculateIndex();
        let old_R_root = R_witness.calculateRoot(Field(0));
        let M_key = M_witness.calculateIndex();
        let old_M_root = M_witness.calculateRoot(Field(0));
        let requestId_key = requestId_witness.calculateIndex();
        let old_requestId_root = requestId_witness.calculateRoot(Field(0));
        let totalFundAmount_key = totalFundAmount_witness.calculateIndex();
        let old_totalFundAmount_root = totalFundAmount_witness.calculateRoot(
            Field(0)
        );

        R_key.assertEquals(proof.publicOutput.campaignId);
        M_key.assertEquals(proof.publicOutput.campaignId);
        requestId_key.assertEquals(proof.publicOutput.campaignId);
        totalFundAmount_key.assertEquals(proof.publicOutput.campaignId);

        R_root.assertEquals(old_R_root);
        M_root.assertEquals(old_M_root);
        requestId_root.assertEquals(old_requestId_root);
        totalFundAmount_root.assertEquals(old_totalFundAmount_root);

        // TODO: check number of investor
        let new_R_root = R_witness.calculateRoot(
            ValueStorage.calculateLeaf(proof.publicOutput.sum_R)
        );
        let new_M_root = M_witness.calculateRoot(
            ValueStorage.calculateLeaf(proof.publicOutput.sum_M)
        );
        let new_requestId_root = requestId_witness.calculateRoot(
            RequestIdStorage.calculateLeaf(requestId)
        );
        let new_totalFundAmount_root = totalFundAmount_witness.calculateRoot(
            TotalFundStorage.calculateLeaf(proof.publicOutput.totalFundAmount)
        );

        // update on-chain state
        this.R_root.set(new_R_root);
        this.M_root.set(new_M_root);
        this.requestId_root.set(new_requestId_root);
        this.totalFundAmount_root.set(new_totalFundAmount_root);

        // Request to Request contract
        // Verify zkApp references
        let zkApps = this.zkApps.getAndRequireEquals();

        // TreasuryContract
        zkApps.assertEquals(
            requestZkAppRef.witness.calculateRoot(
                Poseidon.hash(requestZkAppRef.address.toFields())
            )
        );
        Field(ZkAppEnum.REQUEST).assertEquals(
            requestZkAppRef.witness.calculateIndex()
        );

        // Create & dispatch action to RequestContract
        const requestZkApp = new DKG_Contracts.Request.RequestContract(
            requestZkAppRef.address
        );

        requestZkApp.request(requestInput);

        this.emitEvent(
            EventEnum.REQUEST_SENT,
            new RequestSent({
                campaignId: proof.publicOutput.campaignId,
                committeeId,
                keyId,
                requestId,
                sumR: proof.publicOutput.sum_R,
                sumM: proof.publicOutput.sum_M,
                totalFundAmount: proof.publicOutput.totalFundAmount,
            })
        );
    }

    @method checkMvalue(
        campaignId: Field,
        M: DKG_Contracts.Request.RequestVector,
        wintess: Level1Witness
    ): Bool {
        let isCorrect = Bool(true);

        let caculateCampaignId = wintess.calculateIndex();
        isCorrect = isCorrect.and(campaignId.equals(caculateCampaignId));

        let M_root_on_chain = this.M_root.getAndRequireEquals();
        let calculateM = wintess.calculateRoot(ValueStorage.calculateLeaf(M));
        isCorrect = isCorrect.and(M_root_on_chain.equals(calculateM));

        return isCorrect;
    }

    @method checkRvalue(
        campaignId: Field,
        R: DKG_Contracts.Request.RequestVector,
        wintess: Level1Witness
    ): Bool {
        let isCorrect = Bool(true);

        let caculateCampaignId = wintess.calculateIndex();
        isCorrect = isCorrect.and(campaignId.equals(caculateCampaignId));

        let R_root_on_chain = this.R_root.getAndRequireEquals();
        let calculateR = wintess.calculateRoot(ValueStorage.calculateLeaf(R));
        isCorrect = isCorrect.and(R_root_on_chain.equals(calculateR));

        return isCorrect;
    }
}

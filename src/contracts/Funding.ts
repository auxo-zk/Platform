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
    UInt32,
} from 'o1js';

import {
    BoolDynamicArray,
    CustomScalar,
    ScalarDynamicArray,
    Utils,
} from '@auxo-dev/auxo-libs';

import {
    ZkApp as DkgZkApp,
    Constants as DkgConstants,
    Storage as DkgStorage,
    RequesterContract,
    Libs as DkgLibs,
} from '@auxo-dev/dkg';
import { INSTANCE_LIMITS, MINIMAL_MINA_UNIT, ZkAppEnum } from '../Constants.js';
import {
    ZkAppRef,
    DefaultRootForZkAppTree,
    verifyZkApp,
    AddressWitness,
} from '../storages/SharedStorage.js';
import {
    AmountVector,
    ExistedIndexFlag,
    FundingActionEnum,
    FundingInformation,
    FundingInformationLevel1Witness,
    FundingInformationStorage,
} from '../storages/FundingStorage.js';
import {
    CampaignTimelineStateEnum,
    Timeline,
    TimelineLevel1Witness,
} from '../storages/CampaignStorage.js';
import { ProjectCounterLevel1Witness } from '../storages/ParticipationStorage.js';
import { CampaignContract } from './Campaign.js';
import { ParticipationContract } from './Participation.js';
import { TreasuryManagerContract } from './TreasuryManager.js';
import { CampaignStateLevel1Witness } from '../storages/TreasuryManagerStorage.js';

export {
    FundingAction,
    FundingContract,
    RollupFunding,
    RollupFundingOutput,
    RollupFundingProof,
};

class FundingAction extends Struct({
    fundingId: Field,
    campaignId: Field,
    investor: PublicKey,
    amount: UInt64,
    actionType: Field,
}) {
    getUniqueId() {
        return Poseidon.hash([
            this.fundingId,
            this.campaignId,
            this.actionType,
        ]);
    }
}

class RollupFundingOutput extends Struct({
    initialFundingId: Field,
    initialFundingInformationRoot: Field,
    initialActionState: Field,
    nextFundingId: Field,
    nextFundingInformationRoot: Field,
    nextActionState: Field,
}) {}

const RollupFunding = ZkProgram({
    name: 'RollupFunding',
    publicOutput: RollupFundingOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field],
            method(
                initialFundingId: Field,
                initialFundingInformationRoot: Field,
                initialActionState: Field
            ): RollupFundingOutput {
                return new RollupFundingOutput({
                    initialFundingId: initialFundingId,
                    initialFundingInformationRoot:
                        initialFundingInformationRoot,
                    initialActionState: initialActionState,
                    nextFundingId: initialFundingId,
                    nextFundingInformationRoot: initialFundingInformationRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        fundStep: {
            privateInputs: [
                SelfProof<Void, RollupFundingOutput>,
                FundingAction,
                FundingInformationLevel1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupFundingOutput>,
                fundingAction: FundingAction,
                fundingInformationWitness: FundingInformationLevel1Witness
            ): RollupFundingOutput {
                fundingAction.actionType.assertEquals(
                    Field(FundingActionEnum.FUND)
                );
                fundingInformationWitness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextFundingId);
                fundingInformationWitness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextFundingInformationRoot
                    );

                const nextFundingInformationRoot =
                    fundingInformationWitness.calculateRoot(
                        FundingInformationStorage.calculateLeaf(
                            new FundingInformation({
                                campaignId: fundingAction.campaignId,
                                investor: fundingAction.investor,
                                amount: fundingAction.amount,
                            })
                        )
                    );
                return new RollupFundingOutput({
                    initialFundingId:
                        earlierProof.publicOutput.initialFundingId,
                    initialFundingInformationRoot:
                        earlierProof.publicOutput.initialFundingInformationRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextFundingId:
                        earlierProof.publicOutput.nextFundingId.add(1),
                    nextFundingInformationRoot: nextFundingInformationRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [FundingAction.toFields(fundingAction)]
                    ),
                });
            },
        },
        refundStep: {
            privateInputs: [
                SelfProof<Void, RollupFundingOutput>,
                FundingAction,
                FundingInformationLevel1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupFundingOutput>,
                fundingAction: FundingAction,
                fundingInformationWitness: FundingInformationLevel1Witness
            ) {
                fundingAction.actionType.assertEquals(
                    Field(FundingActionEnum.REFUND)
                );
                fundingInformationWitness
                    .calculateIndex()
                    .assertEquals(fundingAction.fundingId);
                fundingInformationWitness
                    .calculateRoot(
                        FundingInformationStorage.calculateLeaf(
                            new FundingInformation({
                                campaignId: fundingAction.campaignId,
                                investor: fundingAction.investor,
                                amount: fundingAction.amount,
                            })
                        )
                    )
                    .assertEquals(
                        earlierProof.publicOutput.nextFundingInformationRoot
                    );

                const nextFundingInformationRoot =
                    fundingInformationWitness.calculateRoot(
                        FundingInformationStorage.calculateLeaf(
                            new FundingInformation({
                                campaignId: fundingAction.campaignId,
                                investor: fundingAction.investor,
                                amount: new UInt64(0),
                            })
                        )
                    );
                return new RollupFundingOutput({
                    initialFundingId:
                        earlierProof.publicOutput.initialFundingId,
                    initialFundingInformationRoot:
                        earlierProof.publicOutput.initialFundingInformationRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextFundingId: earlierProof.publicOutput.nextFundingId,
                    nextFundingInformationRoot: nextFundingInformationRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [FundingAction.toFields(fundingAction)]
                    ),
                });
            },
        },
    },
});

class RollupFundingProof extends ZkProgram.Proof(RollupFunding) {}

class FundingContract extends SmartContract {
    @state(Field) nextFundingId = State<Field>();
    @state(Field) fundingInformationRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: FundingAction });

    init(): void {
        super.init();
        this.nextFundingId.set(Field(0));
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method fund(
        campaignId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        projectIndexes: Field,
        projectCounter: Field,
        projectCounterWitness: ProjectCounterLevel1Witness,
        committeeId: Field,
        keyId: Field,
        keyWitnessForRequester: DkgStorage.RequesterStorage.RequesterLevel1Witness,
        key: PublicKey,
        keyWitnessForDkg: DkgStorage.DKGStorage.DkgLevel1Witness,
        amounts: AmountVector,
        randomVector: DkgLibs.Requester.RandomVector,
        nullifiers: DkgLibs.Requester.NullifierArray,
        fundingContractWitness: AddressWitness,
        campaignContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        dkgContractRef: ZkAppRef,
        treasuryManagerContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();

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
        participationContract.isValidProjectCounter(
            campaignId,
            projectCounter,
            projectCounterWitness
        );
        const projectIndexesBits = projectIndexes.toBits();
        const existedIndexFlag = new ExistedIndexFlag();
        let totalAmount = new UInt64(0);
        const secretVector = new DkgLibs.Requester.SecretVector();
        for (let i = 0; i < DkgConstants.ENCRYPTION_LIMITS.DIMENSION; i++) {
            const index = Field(i);
            existedIndexFlag.get(index).assertFalse();
            const projectIndex = Field.fromBits(
                projectIndexesBits.slice(i * 8, (i + 1) * 8)
            );
            projectIndex.assertLessThan(projectCounter);
            totalAmount = totalAmount.add(amounts.get(index));
            secretVector.set(
                index,
                CustomScalar.fromUInt64(amounts.get(index))
            );
            existedIndexFlag.set(projectIndex, Bool(true));
        }

        // Check Treasury contract
        verifyZkApp(
            FundingContract.name,
            treasuryManagerContractRef,
            zkAppRoot,
            Field(ZkAppEnum.TREASURY_MANAGER)
        );

        // Check Requester contract
        verifyZkApp(
            FundingContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUESTER)
        );

        const requesterContract = new RequesterContract(
            requesterContractRef.address
        );
        requesterContract.submitEncryption(
            new UInt32(campaignId),
            DkgStorage.DKGStorage.calculateKeyIndex(committeeId, keyId),
            secretVector,
            randomVector,
            projectIndexes,
            nullifiers,
            key.toGroup(),
            keyWitnessForDkg,
            keyWitnessForRequester,
            new ZkAppRef({
                address: this.address,
                witness: fundingContractWitness,
            }),
            dkgContractRef
        );

        const investor = AccountUpdate.createSigned(this.sender);
        investor.send({
            to: AccountUpdate.create(treasuryManagerContractRef.address),
            amount: totalAmount,
        });

        this.reducer.dispatch(
            new FundingAction({
                fundingId: Field(-1),
                campaignId: campaignId,
                investor: this.sender,
                amount: totalAmount,
                actionType: Field(FundingActionEnum.FUND),
            })
        );
    }

    @method refund(
        fundingId: Field,
        campaignId: Field,
        amount: UInt64,
        campaignStateWitness: CampaignStateLevel1Witness,
        fundingInformationWitness: FundingInformationLevel1Witness,
        fundingContractWitness: AddressWitness,
        treasuryManagerContractRef: ZkAppRef
    ) {
        const fundingInformation = new FundingInformation({
            campaignId: campaignId,
            investor: this.sender,
            amount: amount,
        });
        this.isFunded(
            fundingId,
            fundingInformation,
            fundingInformationWitness
        ).assertTrue();

        // Require that this refund action not existed
        const actionState = this.actionState.getAndRequireEquals();
        const actions = this.reducer.getActions({
            fromActionState: actionState,
        });
        const uniqueId = Poseidon.hash([
            fundingId,
            campaignId,
            Field(FundingActionEnum.REFUND),
        ]);
        this.reducer
            .reduce(
                actions,
                Bool,
                (state: Bool, action: FundingAction) => {
                    return state.and(
                        action.getUniqueId().equals(uniqueId).not()
                    );
                },
                {
                    state: Bool(true),
                    actionState: actionState,
                }
            )
            .state.assertTrue();

        verifyZkApp(
            FundingContract.name,
            treasuryManagerContractRef,
            this.zkAppRoot.getAndRequireEquals(),
            Field(ZkAppEnum.TREASURY_MANAGER)
        );
        const treasuryManagerContract = new TreasuryManagerContract(
            treasuryManagerContractRef.address
        );
        treasuryManagerContract.refund(
            fundingInformation,
            campaignStateWitness,
            new ZkAppRef({
                address: this.address,
                witness: fundingContractWitness,
            })
        );

        this.reducer.dispatch(
            new FundingAction({
                fundingId: fundingId,
                campaignId: campaignId,
                investor: this.sender,
                amount: amount,
                actionType: Field(FundingActionEnum.REFUND),
            })
        );
    }

    isFunded(
        fundingId: Field,
        fundingInformation: FundingInformation,
        fundingInformationWitness: FundingInformationLevel1Witness
    ): Bool {
        const nextFundingId = this.nextFundingId.getAndRequireEquals();
        const fundingInformationRoot =
            this.fundingInformationRoot.getAndRequireEquals();
        return fundingId
            .lessThan(nextFundingId)
            .and(fundingInformation.amount.greaterThan(new UInt64(0)))
            .and(fundingInformationWitness.calculateIndex().equals(fundingId))
            .and(
                fundingInformationWitness
                    .calculateRoot(
                        FundingInformationStorage.calculateLeaf(
                            fundingInformation
                        )
                    )
                    .equals(fundingInformationRoot)
            );
    }
}

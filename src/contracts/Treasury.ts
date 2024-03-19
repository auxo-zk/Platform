// import {
//     Field,
//     SmartContract,
//     state,
//     State,
//     method,
//     Reducer,
//     Struct,
//     SelfProof,
//     Poseidon,
//     Provable,
//     ZkProgram,
//     PublicKey,
//     Void,
//     Bool,
//     MerkleMapWitness,
//     Group,
//     Scalar,
//     UInt64,
// } from 'o1js';
// import { updateOutOfSnark } from '../libs/utils.js';

// import { FieldDynamicArray } from '@auxo-dev/auxo-libs';

// import { ZkAppRef } from './SharedStorage.js';

// import {
//     EMPTY_LEVEL_1_TREE,
//     Level1CWitness,
//     ClaimedStorage,
// } from './TreasuryStorage.js';

// import { ZkApp } from '@auxo-dev/dkg';

// import { INSTANCE_LIMITS, ZkAppEnum } from '../Constants.js';

// import { ParticipationContract } from './Participation.js';

// import { Level1CWitness as IndexWitness } from './ParticipationStorage.js';

// import { CampaignContract, CheckCampaignStatusInput } from './Campaign.js';
// import {
//     StatusEnum,
//     Level1Witness as campaignLv1Witness,
// } from './CampaignStorage.js';

// const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

// export class InvestVector extends FieldDynamicArray(
//     INSTANCE_LIMITS.PARTICIPATION_TREE
// ) {}

// export class TreasuryAction extends Struct({
//     campaignId: Field,
//     projectId: Field,
// }) {
//     static fromFields(fields: Field[]): TreasuryAction {
//         return super.fromFields(fields) as TreasuryAction;
//     }

//     id(): Field {
//         return Poseidon.hash([this.campaignId, this.projectId]);
//     }
// }

// export class ClaimFundInput extends Struct({
//     campaignId: Field,
//     projectId: Field,
//     requestId: Field, // TODO: Funding check requestId
//     payeeAccount: PublicKey, // TODO: Project check address
//     M: ZkApp.Request.RequestVector, // check Funding
//     D: ZkApp.Request.RequestVector, // check at request
//     DWitness: MerkleMapWitness, // TODO check request contract
//     investVector: InvestVector,
//     participationIndexWitness: IndexWitness,
//     claimedIndex: Level1CWitness,
//     campaignStatusWitness: campaignLv1Witness,
//     campaignRef: ZkAppRef,
//     participationRef: ZkAppRef,
// }) {
//     static fromFields(fields: Field[]): ClaimFundInput {
//         return super.fromFields(fields) as ClaimFundInput;
//     }
// }

// export class CheckIfNotClaimedInput extends Struct({
//     campaignId: Field,
//     projectId: Field,
//     claimedIndex: Level1CWitness,
// }) {
//     static fromFields(fields: Field[]): CheckIfNotClaimedInput {
//         return super.fromFields(fields) as CheckIfNotClaimedInput;
//     }
// }

// export class ClaimFundProofOutput extends Struct({
//     initialClaimedTreeRoot: Field,
//     initialLastRolledUpActionState: Field,
//     finalClaimedTreeRoot: Field,
//     finalLastRolledUpActionState: Field,
// }) {
//     hash(): Field {
//         return Poseidon.hash(ClaimFundProofOutput.toFields(this));
//     }
// }

// export const ClaimFund = ZkProgram({
//     name: 'claim-fund',
//     publicOutput: ClaimFundProofOutput,
//     methods: {
//         firstStep: {
//             privateInputs: [Field, Field],
//             method(
//                 initialClaimedTreeRoot,
//                 initialLastRolledUpActionState
//             ): ClaimFundProofOutput {
//                 return new ClaimFundProofOutput({
//                     initialClaimedTreeRoot,
//                     initialLastRolledUpActionState,
//                     finalClaimedTreeRoot: initialClaimedTreeRoot,
//                     finalLastRolledUpActionState:
//                         initialLastRolledUpActionState,
//                 });
//             },
//         },
//         nextStep: {
//             privateInputs: [
//                 SelfProof<Void, ClaimFundProofOutput>,
//                 TreasuryAction,
//                 Level1CWitness,
//             ],
//             method(
//                 preProof: SelfProof<Void, ClaimFundProofOutput>,
//                 newAction: TreasuryAction,
//                 claimedIndex: Level1CWitness
//             ): ClaimFundProofOutput {
//                 preProof.verify();

//                 let index = ClaimedStorage.calculateLevel1Index({
//                     campaignId: newAction.campaignId,
//                     projectId: newAction.projectId,
//                 });
//                 index.assertEquals(claimedIndex.calculateIndex());

//                 let curClaimedTreeRoot = claimedIndex.calculateRoot(Field(0));
//                 curClaimedTreeRoot.assertEquals(
//                     preProof.publicOutput.finalClaimedTreeRoot
//                 );

//                 let newClaimedTreeRoot = claimedIndex.calculateRoot(
//                     ClaimedStorage.calculateLeaf(Bool(true))
//                 );

//                 return new ClaimFundProofOutput({
//                     initialClaimedTreeRoot:
//                         preProof.publicOutput.initialClaimedTreeRoot,
//                     initialLastRolledUpActionState:
//                         preProof.publicOutput.initialLastRolledUpActionState,
//                     finalClaimedTreeRoot: newClaimedTreeRoot,
//                     finalLastRolledUpActionState: updateOutOfSnark(
//                         preProof.publicOutput.finalLastRolledUpActionState,
//                         [TreasuryAction.toFields(newAction)]
//                     ),
//                 });
//             },
//         },
//     },
// });

// export class TreasuryProof extends ZkProgram.Proof(ClaimFund) {}

// export enum EventEnum {
//     ACTIONS_REDUCED = 'actions-reduced',
// }

// export class TreasuryContract extends SmartContract {
//     // store claimed status
//     @state(Field) claimedTreeRoot = State<Field>();
//     // MT of other zkApp address
//     @state(Field) zkApps = State<Field>();
//     @state(Field) lastRolledUpActionState = State<Field>();

//     reducer = Reducer({ actionType: TreasuryAction });

//     events = {
//         [EventEnum.ACTIONS_REDUCED]: Field,
//     };

//     init() {
//         super.init();
//         this.claimedTreeRoot.set(DefaultLevel1Root);
//         this.lastRolledUpActionState.set(Reducer.initialActionState);
//     }

//     @method claimFund(input: ClaimFundInput) {
//         // TODO: check campaign config
//         // TODO: check D value in contract Request

//         let action = new TreasuryAction({
//             campaignId: input.campaignId,
//             projectId: input.projectId,
//         });

//         let id = action.id();

//         let lastRolledUpActionState =
//             this.lastRolledUpActionState.getAndRequireEquals();

//         // TODO: not really able to do this, check again. If both of them send at the same block
//         // checking if the request have the same id already exists within the accumulator
//         let { state: exists } = this.reducer.reduce(
//             this.reducer.getActions({
//                 fromActionState: lastRolledUpActionState,
//             }),
//             Bool,
//             (state: Bool, action: TreasuryAction) => {
//                 return action.id().equals(id).or(state);
//             },
//             // initial state
//             { state: Bool(false), actionState: lastRolledUpActionState }
//         );

//         // if exists then don't dispatch any more
//         exists.assertEquals(Bool(false));

//         for (let i = 0; i < INSTANCE_LIMITS.PARTICIPATION_TREE; i++) {
//             let sumMsubSumD = input.M.get(Field(i)).sub(input.D.get(Field(i)));
//             let point = Provable.witness(Group, () => {
//                 return Group.generator.scale(
//                     Scalar.from(input.investVector.get(Field(i)).toBigInt())
//                 );
//             });
//             point.x.assertEquals(sumMsubSumD.x);
//             point.y.assertEquals(sumMsubSumD.y);
//         }

//         let zkApps = this.zkApps.getAndRequireEquals();
//         // Verify participation contract
//         zkApps.assertEquals(
//             input.participationRef.witness.calculateRoot(
//                 Poseidon.hash(input.participationRef.address.toFields())
//             )
//         );
//         Field(ZkAppEnum.PARTICIPATION).assertEquals(
//             input.participationRef.witness.calculateIndex()
//         );
//         // TODO: check this latter
//         let participationContract = new ParticipationContract(
//             input.participationRef.address
//         );

//         // check campaign contract
//         zkApps.assertEquals(
//             input.campaignRef.witness.calculateRoot(
//                 Poseidon.hash(input.campaignRef.address.toFields())
//             )
//         );
//         Field(ZkAppEnum.CAMPAIGN).assertEquals(
//             input.campaignRef.witness.calculateIndex()
//         );

//         let campaignContract = new CampaignContract(input.campaignRef.address);

//         // check if campaign is on ALLOCATED status
//         let isAbleToJoin = campaignContract.checkCampaignStatus(
//             new CheckCampaignStatusInput({
//                 campaignId: input.campaignId,
//                 currentStatus: Field(StatusEnum.ALLOCATED),
//                 statusWitness: input.campaignStatusWitness,
//             })
//         );
//         isAbleToJoin.assertEquals(Bool(true));

//         let participationIndex =
//             input.participationIndexWitness.calculateIndex();

//         // check if claimed
//         this.checkIfNotClaimed(
//             new CheckIfNotClaimedInput({
//                 campaignId: input.campaignId,
//                 projectId: input.projectId,
//                 claimedIndex: input.claimedIndex,
//             })
//         ).assertEquals(Bool(true));

//         let claimAmount = input.investVector.get(
//             participationIndex.sub(Field(1)) // since index start from 1
//         );

//         // send invest amount
//         this.send({ to: input.payeeAccount, amount: UInt64.from(claimAmount) });

//         this.reducer.dispatch(action);
//     }

//     @method rollup(proof: TreasuryProof) {
//         proof.verify();

//         let claimedTreeRoot = this.claimedTreeRoot.getAndRequireEquals();
//         let lastRolledUpActionState =
//             this.lastRolledUpActionState.getAndRequireEquals();

//         claimedTreeRoot.assertEquals(proof.publicOutput.initialClaimedTreeRoot);
//         lastRolledUpActionState.assertEquals(
//             proof.publicOutput.initialLastRolledUpActionState
//         );

//         let lastActionState = this.account.actionState.getAndRequireEquals();
//         lastActionState.assertEquals(
//             proof.publicOutput.finalLastRolledUpActionState
//         );

//         // update on-chain state
//         this.claimedTreeRoot.set(proof.publicOutput.finalClaimedTreeRoot);
//         this.lastRolledUpActionState.set(
//             proof.publicOutput.finalLastRolledUpActionState
//         );

//         this.emitEvent(EventEnum.ACTIONS_REDUCED, lastActionState);
//     }

//     @method checkIfNotClaimed(input: CheckIfNotClaimedInput): Bool {
//         let isNotClaimed = Bool(true);

//         let index = ClaimedStorage.calculateLevel1Index({
//             campaignId: input.campaignId,
//             projectId: input.projectId,
//         });
//         isNotClaimed = isNotClaimed.and(
//             index.equals(input.claimedIndex.calculateIndex())
//         );

//         let curClaimedTreeRoot = this.claimedTreeRoot.getAndRequireEquals();
//         isNotClaimed = isNotClaimed.and(
//             curClaimedTreeRoot.equals(
//                 input.claimedIndex.calculateRoot(Field(0))
//             )
//         );

//         return isNotClaimed;
//     }
// }

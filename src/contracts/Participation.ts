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
// } from 'o1js';
// import { IpfsHash } from '@auxo-dev/auxo-libs';
// import { updateOutOfSnark } from '../libs/utils.js';
// import {
//     EMPTY_LEVEL_1_TREE,
//     EMPTY_LEVEL_1_COMBINED_TREE,
//     Level1CWitness as indexAndInfoWitness,
//     Level1Witness as counterWitness,
//     IndexStorage,
//     CounterStorage,
//     InfoStorage,
// } from './ParticipationStorage.js';

// import {
//     Level1Witness as projectLv1Witness,
//     Level2Witness as projectLv2Witness,
// } from './ProjectStorage.js';
// import { ProjectContract, CheckProjectOwnerInput } from './Project.js';

// import { ZkAppRef } from './SharedStorage.js';

// import { ZkAppEnum } from '../Constants.js';
// import { CampaignContract, CheckCampaignStatusInput } from './Campaign.js';
// import {
//     StatusEnum,
//     Level1Witness as campaignLv1Witness,
// } from './CampaignStorage.js';

// const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();
// const DefaultLevel1CombinedRoot = EMPTY_LEVEL_1_COMBINED_TREE().getRoot();

// export enum EventEnum {
//     ACTIONS_REDUCED = 'actions-reduced',
// }

// export class ParticipationAction extends Struct({
//     campaignId: Field,
//     projectId: Field,
//     participationInfo: IpfsHash,
//     curApplicationInfoHash: Field,
// }) {
//     static fromFields(fields: Field[]): ParticipationAction {
//         return super.fromFields(fields) as ParticipationAction;
//     }

//     hashPIDandCID(): Field {
//         return Poseidon.hash([this.campaignId, this.projectId]);
//     }
// }

// export class JoinCampaignInput extends Struct({
//     campaignId: Field,
//     projectId: Field,
//     participationInfo: IpfsHash,
//     indexWitness: indexAndInfoWitness,
//     memberLv1Witness: projectLv1Witness,
//     memberLv2Witness: projectLv2Witness,
//     campaignStatusWitness: campaignLv1Witness,
//     projectRef: ZkAppRef,
//     campaignRef: ZkAppRef,
// }) {
//     static fromFields(fields: Field[]): JoinCampaignInput {
//         return super.fromFields(fields) as JoinCampaignInput;
//     }
// }

// export class CheckParticipationIndexInput extends Struct({
//     campaignId: Field,
//     projectId: Field,
//     participationIndex: Field,
//     indexWitness: indexAndInfoWitness,
// }) {
//     static fromFields(fields: Field[]): CheckParticipationIndexInput {
//         return super.fromFields(fields) as CheckParticipationIndexInput;
//     }
// }

// export class CreateParticipationProofOutput extends Struct({
//     initialIndexTreeRoot: Field,
//     initialInfoTreeRoot: Field,
//     initialCounterTreeRoot: Field,
//     initialLastRolledUpACtionState: Field,
//     finalIndexTreeRoot: Field,
//     finalInfoTreeRoot: Field,
//     finalCounterTreeRoot: Field,
//     finalLastRolledUpActionState: Field,
// }) {
//     hash(): Field {
//         return Poseidon.hash(CreateParticipationProofOutput.toFields(this));
//     }
// }

// export const JoinCampaign = ZkProgram({
//     name: 'join-campaign',
//     publicOutput: CreateParticipationProofOutput,
//     methods: {
//         firstStep: {
//             privateInputs: [Field, Field, Field, Field],
//             method(
//                 initialIndexTreeRoot: Field,
//                 initialInfoTreeRoot: Field,
//                 initialCounterTreeRoot: Field,
//                 initialLastRolledUpACtionState: Field
//             ): CreateParticipationProofOutput {
//                 return new CreateParticipationProofOutput({
//                     initialIndexTreeRoot,
//                     initialInfoTreeRoot,
//                     initialCounterTreeRoot,
//                     initialLastRolledUpACtionState,
//                     finalIndexTreeRoot: initialIndexTreeRoot,
//                     finalInfoTreeRoot: initialInfoTreeRoot,
//                     finalCounterTreeRoot: initialCounterTreeRoot,
//                     finalLastRolledUpActionState:
//                         initialLastRolledUpACtionState,
//                 });
//             },
//         },
//         joinCampaign: {
//             privateInputs: [
//                 SelfProof<Void, CreateParticipationProofOutput>,
//                 ParticipationAction,
//                 indexAndInfoWitness,
//                 indexAndInfoWitness,
//                 Field,
//                 counterWitness,
//             ],
//             method(
//                 preProof: SelfProof<Void, CreateParticipationProofOutput>,
//                 newAction: ParticipationAction,
//                 indexWitness: indexAndInfoWitness,
//                 infoWitness: indexAndInfoWitness,
//                 currentCounter: Field, // of each campaign
//                 counterWitness: counterWitness
//             ): CreateParticipationProofOutput {
//                 preProof.verify();

//                 // calculated index in storage tree, called id
//                 let id = IndexStorage.calculateLevel1Index({
//                     campaignId: newAction.campaignId,
//                     projectId: newAction.projectId,
//                 });

//                 // update counter
//                 let counterId = counterWitness.calculateIndex();
//                 counterId.assertEquals(newAction.campaignId);
//                 let curCounterTreeRoot =
//                     counterWitness.calculateRoot(currentCounter);
//                 curCounterTreeRoot.assertEquals(
//                     preProof.publicOutput.finalCounterTreeRoot
//                 );
//                 let newCounter = currentCounter.add(Field(1));
//                 let newCounterTreeRoot =
//                     counterWitness.calculateRoot(newCounter);

//                 // update index
//                 let indexId = indexWitness.calculateIndex();
//                 indexId.assertEquals(id);
//                 let curIndexTreeRoot = indexWitness.calculateRoot(Field(0));
//                 curIndexTreeRoot.assertEquals(
//                     preProof.publicOutput.finalIndexTreeRoot
//                 );
//                 let newIndexTreeRoot = indexWitness.calculateRoot(newCounter);

//                 // update info-ipfs hash
//                 let infoId = infoWitness.calculateIndex();
//                 infoId.assertEquals(id);
//                 let curInfoTreeRoot = infoWitness.calculateRoot(Field(0));
//                 curInfoTreeRoot.assertEquals(
//                     preProof.publicOutput.finalInfoTreeRoot
//                 );
//                 let newInfoTreeRoot = infoWitness.calculateRoot(
//                     InfoStorage.calculateLeaf(newAction.participationInfo)
//                 );

//                 return new CreateParticipationProofOutput({
//                     initialIndexTreeRoot:
//                         preProof.publicOutput.initialIndexTreeRoot,
//                     initialInfoTreeRoot:
//                         preProof.publicOutput.initialInfoTreeRoot,
//                     initialCounterTreeRoot:
//                         preProof.publicOutput.initialCounterTreeRoot,
//                     initialLastRolledUpACtionState:
//                         preProof.publicOutput.initialLastRolledUpACtionState,
//                     finalIndexTreeRoot: newIndexTreeRoot,
//                     finalCounterTreeRoot: newCounterTreeRoot,
//                     finalInfoTreeRoot: newInfoTreeRoot,
//                     finalLastRolledUpActionState: updateOutOfSnark(
//                         preProof.publicOutput.finalLastRolledUpActionState,
//                         [ParticipationAction.toFields(newAction)]
//                     ),
//                 });
//             },
//         },
//     },
// });

// export class ParticipationProof extends ZkProgram.Proof(JoinCampaign) {}

// export class ParticipationContract extends SmartContract {
//     // campaignId -> Id(campaignId + projectId) -> index. start from 1, if index = 0 means that project have not participate
//     @state(Field) indexTreeRoot = State<Field>();
//     // campaignId -> Id(campaignId + projectId) -> info
//     @state(Field) infoTreeRoot = State<Field>();
//     // campaignId -> counter
//     @state(Field) counterTreeRoot = State<Field>();
//     // MT of other zkApp address
//     @state(Field) zkApps = State<Field>();
//     @state(Field) lastRolledUpActionState = State<Field>();

//     reducer = Reducer({ actionType: ParticipationAction });
//     events = {
//         [EventEnum.ACTIONS_REDUCED]: Field,
//     };

//     init() {
//         super.init();
//         this.indexTreeRoot.set(DefaultLevel1CombinedRoot);
//         this.infoTreeRoot.set(DefaultLevel1CombinedRoot);
//         this.counterTreeRoot.set(DefaultLevel1Root);
//         this.lastRolledUpActionState.set(Reducer.initialActionState);
//     }

//     @method joinCampaign(input: JoinCampaignInput) {
//         let zkApps = this.zkApps.getAndRequireEquals();

//         // check project contract
//         zkApps.assertEquals(
//             input.projectRef.witness.calculateRoot(
//                 Poseidon.hash(input.projectRef.address.toFields())
//             )
//         );
//         Field(ZkAppEnum.PROJECT).assertEquals(
//             input.projectRef.witness.calculateIndex()
//         );
//         let projectContract = new ProjectContract(input.projectRef.address);

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

//         // check owner
//         let isOwner = projectContract.checkProjectOwner(
//             new CheckProjectOwnerInput({
//                 owner: this.sender,
//                 projectId: input.projectId,
//                 memberLevel1Witness: input.memberLv1Witness,
//                 memberLevel2Witness: input.memberLv2Witness,
//             })
//         );
//         isOwner.assertEquals(Bool(true));

//         // check if campaign is on APPLICATION status
//         let isAbleToJoin = campaignContract.checkCampaignStatus(
//             new CheckCampaignStatusInput({
//                 campaignId: input.campaignId,
//                 currentStatus: Field(StatusEnum.APPLICATION),
//                 statusWitness: input.campaignStatusWitness,
//             })
//         );
//         isAbleToJoin.assertEquals(Bool(true));

//         // check if this is first time join campaign
//         let notIn = this.checkParticipationIndex(
//             new CheckParticipationIndexInput({
//                 campaignId: input.campaignId,
//                 projectId: input.projectId,
//                 participationIndex: Field(0),
//                 indexWitness: input.indexWitness,
//             })
//         );

//         notIn.assertEquals(Bool(true));

//         // each project can only participate campaign once
//         let lastRolledUpActionState =
//             this.lastRolledUpActionState.getAndRequireEquals();

//         let newAction = new ParticipationAction({
//             campaignId: input.campaignId,
//             projectId: input.projectId,
//             participationInfo: input.participationInfo,
//             curApplicationInfoHash: Field(0),
//         });

//         let checkHash = newAction.hashPIDandCID();

//         // TODO: not really able to do this, check again. If both of them send at the same block
//         // checking if the request have the same id already exists within the accumulator
//         let { state: exists } = this.reducer.reduce(
//             this.reducer.getActions({
//                 fromActionState: lastRolledUpActionState,
//             }),
//             Bool,
//             (state: Bool, action: ParticipationAction) => {
//                 return action.hashPIDandCID().equals(checkHash).or(state);
//             },
//             // initial state
//             { state: Bool(false), actionState: lastRolledUpActionState }
//         );

//         // if exists then don't dispatch any more
//         exists.assertEquals(Bool(false));

//         this.reducer.dispatch(newAction);
//     }

//     @method rollup(proof: ParticipationProof) {
//         proof.verify();
//         let indexTreeRoot = this.indexTreeRoot.getAndRequireEquals();
//         let infoTreeRoot = this.infoTreeRoot.getAndRequireEquals();
//         let counterTreeRoot = this.counterTreeRoot.getAndRequireEquals();
//         let lastRolledUpActionState =
//             this.lastRolledUpActionState.getAndRequireEquals();

//         indexTreeRoot.assertEquals(proof.publicOutput.initialIndexTreeRoot);
//         infoTreeRoot.assertEquals(proof.publicOutput.initialInfoTreeRoot);
//         counterTreeRoot.assertEquals(proof.publicOutput.initialCounterTreeRoot);
//         lastRolledUpActionState.assertEquals(
//             proof.publicOutput.initialLastRolledUpACtionState
//         );

//         let lastActionState = this.account.actionState.getAndRequireEquals();
//         lastActionState.assertEquals(
//             proof.publicOutput.finalLastRolledUpActionState
//         );

//         // update on-chain state
//         this.indexTreeRoot.set(proof.publicOutput.finalIndexTreeRoot);
//         this.infoTreeRoot.set(proof.publicOutput.finalInfoTreeRoot);
//         this.counterTreeRoot.set(proof.publicOutput.finalCounterTreeRoot);
//         this.lastRolledUpActionState.set(
//             proof.publicOutput.finalLastRolledUpActionState
//         );

//         this.emitEvent(EventEnum.ACTIONS_REDUCED, lastActionState);
//     }

//     checkParticipationIndex(input: CheckParticipationIndexInput): Bool {
//         let isValid = Bool(true);

//         let index = IndexStorage.calculateLevel1Index({
//             campaignId: input.campaignId,
//             projectId: input.projectId,
//         });

//         // check the right projectId
//         let calculateIndex = input.indexWitness.calculateIndex();
//         isValid = index.equals(calculateIndex).and(isValid);

//         // check the valid of the index
//         let level1Root = input.indexWitness.calculateRoot(
//             input.participationIndex
//         );
//         isValid = level1Root
//             .equals(this.indexTreeRoot.getAndRequireEquals())
//             .and(isValid);

//         return isValid;
//     }
// }

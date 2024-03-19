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
// import { INSTANCE_LIMITS.PROJECT_MEMBER_TREE } from '../Constants.js';
// import {
//     EMPTY_LEVEL_1_TREE,
//     EMPTY_LEVEL_2_TREE,
//     Level1Witness,
//     Level2Witness,
//     FullMTWitness,
//     MemberArray,
//     InfoStorage,
//     AddressStorage,
//     DefaultLevel1Root
// } from './ProjectStorage.js';

// export class ProjectAction extends Struct({
//     projectId: Field,
//     members: MemberArray,
//     ipfsHash: IpfsHash,
//     payeeAccount: PublicKey,
// }) {
//     static fromFields(fields: Field[]): ProjectAction {
//         return super.fromFields(fields) as ProjectAction;
//     }
// }

// export class CheckProjectOwnerInput extends Struct({
//     owner: PublicKey,
//     projectId: Field,
//     memberLevel1Witness: Level1Witness,
//     memberLevel2Witness: Level2Witness,
// }) {}

// export class CreateProjectInput extends Struct({
//     members: MemberArray,
//     ipfsHash: IpfsHash,
//     payeeAccount: PublicKey,
// }) {
//     static fromFields(fields: Field[]): CreateProjectInput {
//         return super.fromFields(fields) as CreateProjectInput;
//     }
// }

// export class UpdateProjectInput extends Struct({
//     projectId: Field,
//     members: MemberArray,
//     ipfsHash: IpfsHash,
//     payeeAccount: PublicKey,
//     memberLevel1Witness: Level1Witness,
//     memberLevel2Witness: Level2Witness,
// }) {
//     static fromFields(fields: Field[]): UpdateProjectInput {
//         return super.fromFields(fields) as UpdateProjectInput;
//     }
// }

// export class CreateProjectProofOutput extends Struct({
//     initialNextProjectId: Field,
//     initialMemberTreeRoot: Field,
//     initialProjectInfoTreeRoot: Field,
//     initialPayeeTreeRoot: Field,
//     initialLastRolledUpActionState: Field,
//     finalNextProjectId: Field,
//     finalMemberTreeRoot: Field,
//     finalProjectInfoTreeRoot: Field,
//     finalPayeeTreeRoot: Field,
//     finalLastRolledUpActionState: Field,
// }) {
//     hash(): Field {
//         return Poseidon.hash(CreateProjectProofOutput.toFields(this));
//     }
// }

// export const CreateProject = ZkProgram({
//     name: 'create-project',
//     publicOutput: CreateProjectProofOutput,
//     methods: {
//         firstStep: {
//             privateInputs: [Field, Field, Field, Field, Field],
//             method(
//                 initialNextProjectId: Field,
//                 initialMemberTreeRoot: Field,
//                 initialProjectInfoTreeRoot: Field,
//                 initialPayeeTreeRoot: Field,
//                 initialLastRolledUpActionState: Field
//             ): CreateProjectProofOutput {
//                 return new CreateProjectProofOutput({
//                     initialNextProjectId,
//                     initialMemberTreeRoot,
//                     initialProjectInfoTreeRoot,
//                     initialPayeeTreeRoot,
//                     initialLastRolledUpActionState,
//                     finalNextProjectId: initialNextProjectId,
//                     finalMemberTreeRoot: initialMemberTreeRoot,
//                     finalProjectInfoTreeRoot: initialProjectInfoTreeRoot,
//                     finalPayeeTreeRoot: initialPayeeTreeRoot,
//                     finalLastRolledUpActionState:
//                         initialLastRolledUpActionState,
//                 });
//             },
//         },
//         nextStep: {
//             privateInputs: [
//                 SelfProof<Void, CreateProjectProofOutput>,
//                 ProjectAction,
//                 Level1Witness,
//                 Level1Witness,
//                 Level1Witness,
//             ],
//             method(
//                 preProof: SelfProof<Void, CreateProjectProofOutput>,
//                 newAction: ProjectAction,
//                 memberWitness: Level1Witness,
//                 projectInfoWitess: Level1Witness,
//                 payeeWitness: Level1Witness
//             ): CreateProjectProofOutput {
//                 preProof.verify();

//                 // check if create project
//                 let isCreateProject = newAction.projectId.equals(Field(-1));
//                 // if create project: newProjectId = next project id
//                 // if update project: newProjectId = newAction projectId
//                 let newProjectId = Provable.if(
//                     isCreateProject,
//                     preProof.publicOutput.finalNextProjectId,
//                     newAction.projectId
//                 );

//                 let nextProjectId = Provable.if(
//                     isCreateProject,
//                     preProof.publicOutput.finalNextProjectId.add(Field(1)),
//                     preProof.publicOutput.finalNextProjectId
//                 );

//                 ////// calculate new memberTreeRoot
//                 let newProjectIndex = memberWitness.calculateIndex();
//                 let preMemberRoot = memberWitness.calculateRoot(Field(0));
//                 newProjectId.assertEquals(newProjectIndex);
//                 preMemberRoot.assertEquals(
//                     preProof.publicOutput.finalMemberTreeRoot
//                 );

//                 let tree = EMPTY_LEVEL_2_TREE();
//                 for (let i = 0; i < INSTANCE_LIMITS.PROJECT_MEMBER_TREE; i++) {
//                     let value = Provable.if(
//                         Field(i).greaterThanOrEqual(newAction.members.length),
//                         Field(0),
//                         MemberArray.hash(newAction.members.get(Field(i)))
//                     );
//                     tree.setLeaf(BigInt(i), value);
//                 }

//                 // update new member tree
//                 let newMemberTreeRoot = memberWitness.calculateRoot(
//                     tree.getRoot()
//                 );

//                 ////// calculate new projectInfoTreeRoot
//                 let preProjectInfoRoot = projectInfoWitess.calculateRoot(
//                     Field(0)
//                 );
//                 let projectInfoIndex = projectInfoWitess.calculateIndex();
//                 projectInfoIndex.assertEquals(newProjectId);
//                 preProjectInfoRoot.assertEquals(
//                     preProof.publicOutput.finalProjectInfoTreeRoot
//                 );

//                 // update project info tree with hash ipfs hash
//                 let newProjectInfoTreeRoot = projectInfoWitess.calculateRoot(
//                     InfoStorage.calculateLeaf(newAction.ipfsHash)
//                 );

//                 ////// calculate new addressTreeRoot
//                 let prePayeeTreeRoot = payeeWitness.calculateRoot(Field(0));
//                 let addressIndex = payeeWitness.calculateIndex();
//                 addressIndex.assertEquals(newProjectId);
//                 prePayeeTreeRoot.assertEquals(
//                     preProof.publicOutput.finalPayeeTreeRoot
//                 );

//                 // update project info tree with hash ipfs hash
//                 let newPayeeTreeRoot = payeeWitness.calculateRoot(
//                     AddressStorage.calculateLeaf(newAction.payeeAccount)
//                 );

//                 return new CreateProjectProofOutput({
//                     initialNextProjectId:
//                         preProof.publicOutput.initialNextProjectId,
//                     initialMemberTreeRoot:
//                         preProof.publicOutput.initialMemberTreeRoot,
//                     initialProjectInfoTreeRoot:
//                         preProof.publicOutput.initialProjectInfoTreeRoot,
//                     initialPayeeTreeRoot:
//                         preProof.publicOutput.initialPayeeTreeRoot,
//                     initialLastRolledUpActionState:
//                         preProof.publicOutput.initialLastRolledUpActionState,
//                     finalNextProjectId: nextProjectId,
//                     finalMemberTreeRoot: newMemberTreeRoot,
//                     finalProjectInfoTreeRoot: newProjectInfoTreeRoot,
//                     finalPayeeTreeRoot: newPayeeTreeRoot,
//                     finalLastRolledUpActionState: updateOutOfSnark(
//                         preProof.publicOutput.finalLastRolledUpActionState,
//                         [ProjectAction.toFields(newAction)]
//                     ),
//                 });
//             },
//         },
//     },
// });

// export class ProjectProof extends ZkProgram.Proof(CreateProject) {}

// export enum EventEnum {
//     PROJECT_CREATED = 'project-created',
// }

// export class ProjectContract extends SmartContract {
//     @state(Field) nextProjectId = State<Field>();
//     @state(Field) memberTreeRoot = State<Field>();
//     @state(Field) projectInfoTreeRoot = State<Field>();
//     @state(Field) payeeTreeRoot = State<Field>();
//     @state(Field) lastRolledUpActionState = State<Field>();

//     reducer = Reducer({ actionType: ProjectAction });

//     events = {
//         [EventEnum.PROJECT_CREATED]: Field,
//     };

//     init() {
//         super.init();
//         this.memberTreeRoot.set(DefaultLevel1Root);
//         this.projectInfoTreeRoot.set(DefaultLevel1Root);
//         this.payeeTreeRoot.set(DefaultLevel1Root);
//         this.lastRolledUpActionState.set(Reducer.initialActionState);
//     }

//     @method createProject(input: CreateProjectInput) {
//         this.reducer.dispatch(
//             new ProjectAction({
//                 projectId: Field(-1),
//                 members: input.members,
//                 ipfsHash: input.ipfsHash,
//                 payeeAccount: input.payeeAccount,
//             })
//         );
//     }

//     @method updateProjectInfo(input: UpdateProjectInput) {
//         // check the right projectId
//         let projectId = input.memberLevel1Witness.calculateIndex();
//         projectId.assertEquals(input.projectId);

//         // check only project have been created can be updated
//         projectId.assertLessThan(this.nextProjectId.getAndRequireEquals());

//         // check the right owner index
//         let memberIndex = input.memberLevel2Witness.calculateIndex();
//         memberIndex.assertEquals(Field(0));
//         // check the same on root
//         let memberLevel2Root = input.memberLevel2Witness.calculateRoot(
//             Poseidon.hash(PublicKey.toFields(this.sender))
//         );
//         let memberLevel1Root =
//             input.memberLevel1Witness.calculateRoot(memberLevel2Root);
//         memberLevel1Root.assertEquals(
//             this.memberTreeRoot.getAndRequireEquals()
//         );

//         let lastRolledUpActionState =
//             this.lastRolledUpActionState.getAndRequireEquals();

//         // TODO: not really able to do this, check again. If both of them send at the same block
//         // checking if the request have the same id already exists within the accumulator
//         let { state: exists } = this.reducer.reduce(
//             this.reducer.getActions({
//                 fromActionState: lastRolledUpActionState,
//             }),
//             Bool,
//             (state: Bool, action: ProjectAction) => {
//                 return action.projectId.equals(projectId).or(state);
//             },
//             // initial state
//             { state: Bool(false), actionState: lastRolledUpActionState }
//         );

//         // if exists then don't dispatch any more
//         exists.assertEquals(Bool(false));

//         this.reducer.dispatch(
//             new ProjectAction({
//                 projectId: input.projectId,
//                 members: input.members,
//                 ipfsHash: input.ipfsHash,
//                 payeeAccount: input.payeeAccount,
//             })
//         );
//     }

//     @method rollup(proof: ProjectProof) {
//         proof.verify();
//         let nextProjectId = this.nextProjectId.getAndRequireEquals();
//         let memberTreeRoot = this.memberTreeRoot.getAndRequireEquals();
//         let projectInfoTreeRoot =
//             this.projectInfoTreeRoot.getAndRequireEquals();
//         let payeeTreeRoot = this.payeeTreeRoot.getAndRequireEquals();
//         let lastRolledUpActionState =
//             this.lastRolledUpActionState.getAndRequireEquals();

//         nextProjectId.assertEquals(proof.publicOutput.initialNextProjectId);
//         memberTreeRoot.assertEquals(proof.publicOutput.initialMemberTreeRoot);
//         projectInfoTreeRoot.assertEquals(
//             proof.publicOutput.initialProjectInfoTreeRoot
//         );
//         payeeTreeRoot.assertEquals(proof.publicOutput.initialPayeeTreeRoot);
//         lastRolledUpActionState.assertEquals(
//             proof.publicOutput.initialLastRolledUpActionState
//         );

//         let lastActionState = this.account.actionState.getAndRequireEquals();
//         lastActionState.assertEquals(
//             proof.publicOutput.finalLastRolledUpActionState
//         );

//         // update on-chain state
//         this.nextProjectId.set(proof.publicOutput.finalNextProjectId);
//         this.memberTreeRoot.set(proof.publicOutput.finalMemberTreeRoot);
//         this.projectInfoTreeRoot.set(
//             proof.publicOutput.finalProjectInfoTreeRoot
//         );
//         this.payeeTreeRoot.set(proof.publicOutput.finalPayeeTreeRoot);
//         this.lastRolledUpActionState.set(
//             proof.publicOutput.finalLastRolledUpActionState
//         );

//         this.emitEvent(
//             EventEnum.PROJECT_CREATED,
//             proof.publicOutput.finalNextProjectId.sub(Field(1))
//         );
//     }

//     checkProjectOwner(input: CheckProjectOwnerInput): Bool {
//         let isOwner = Bool(true);

//         // check the right projectId
//         let projectId = input.memberLevel1Witness.calculateIndex();
//         isOwner = projectId.equals(input.projectId).and(isOwner);

//         // check the right owner index, is = 0
//         let memberIndex = input.memberLevel2Witness.calculateIndex();
//         isOwner = memberIndex.equals(Field(0)).and(isOwner);
//         // check the same on root
//         let memberLevel2Root = input.memberLevel2Witness.calculateRoot(
//             Poseidon.hash(PublicKey.toFields(input.owner))
//         );
//         let memberLevel1Root =
//             input.memberLevel1Witness.calculateRoot(memberLevel2Root);
//         isOwner = memberLevel1Root
//             .equals(this.memberTreeRoot.getAndRequireEquals())
//             .and(isOwner);

//         return isOwner;
//     }
// }

import {
  Field,
  SmartContract,
  state,
  State,
  method,
  Reducer,
  Struct,
  SelfProof,
  Poseidon,
  Provable,
  ZkProgram,
  PublicKey,
  Void,
  Bool,
} from 'o1js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import { PROJECT_MEMBER_MAX_SIZE } from '../constants.js';
import {
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE,
  Level1Witness,
  Level2Witness,
  FullMTWitness,
  MemberArray,
} from './ProjectStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();
const DefaultLevel2Root = EMPTY_LEVEL_1_TREE().getRoot();

export class ProjectAction extends Struct({
  projectId: Field,
  members: MemberArray,
  ipfsHash: IPFSHash,
}) {
  static fromFields(fields: Field[]): ProjectAction {
    return super.fromFields(fields) as ProjectAction;
  }
}

export class CheckProjectOwerInput extends Struct({
  owner: PublicKey,
  projectId: Field,
  memberLevel1Witness: Level1Witness,
  memberLevel2Witness: Level2Witness,
}) {}

export class CreateProjectInput extends Struct({
  members: MemberArray,
  ipfsHash: IPFSHash,
}) {
  static fromFields(fields: Field[]): CreateProjectInput {
    return super.fromFields(fields) as CreateProjectInput;
  }
}

export class UpdateProjectInput extends Struct({
  projectId: Field,
  members: MemberArray,
  ipfsHash: IPFSHash,
  memberLevel1Witness: Level1Witness,
  memberLevel2Witness: Level2Witness,
}) {
  static fromFields(fields: Field[]): UpdateProjectInput {
    return super.fromFields(fields) as UpdateProjectInput;
  }
}

export class CreateProjectProofOutput extends Struct({
  initialNextProjectId: Field,
  initialMemberTreeRoot: Field,
  initialProjectInfoTreeRoot: Field,
  initialLastRolledUpACtionState: Field,
  finalNextProjectId: Field,
  finalMemberTreeRoot: Field,
  finalProjectInfoTreeRoot: Field,
  finalLastRolledUpACtionState: Field,
}) {
  hash(): Field {
    return Poseidon.hash(CreateProjectProofOutput.toFields(this));
  }
}

export const CreateProject = ZkProgram({
  name: 'create-project',
  publicOutput: CreateProjectProofOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field, Field, Field],
      method(
        initialNextProjectId: Field,
        initialMemberTreeRoot: Field,
        initialProjectInfoTreeRoot: Field,
        initialLastRolledUpACtionState: Field
      ): CreateProjectProofOutput {
        return new CreateProjectProofOutput({
          initialNextProjectId,
          initialMemberTreeRoot,
          initialProjectInfoTreeRoot,
          initialLastRolledUpACtionState,
          finalNextProjectId: initialNextProjectId,
          finalMemberTreeRoot: initialMemberTreeRoot,
          finalProjectInfoTreeRoot: initialProjectInfoTreeRoot,
          finalLastRolledUpACtionState: initialLastRolledUpACtionState,
        });
      },
    },
    nextStep: {
      privateInputs: [SelfProof<Void, CreateProjectProofOutput>],
      method(
        preProof: SelfProof<Void, CreateProjectProofOutput>
      ): CreateProjectProofOutput {
        preProof.verify();
        return new CreateProjectProofOutput({});
      },
    },
  },
});

class ProjectProof extends ZkProgram.Proof(CreateProject) {}

export enum EventEnum {
  PROJECT_CREATED = 'project-created',
}

export class ProjectContract extends SmartContract {
  @state(Field) nextProjectId = State<Field>();
  @state(Field) memberTreeRoot = State<Field>();
  @state(Field) projectInfoTreeRoot = State<Field>();
  @state(Field) lastRolledUpActionState = State<Field>();

  reducer = Reducer({ actionType: ProjectAction });

  events = {
    [EventEnum.PROJECT_CREATED]: Field,
  };

  init() {
    super.init();
    this.memberTreeRoot.set(DefaultLevel2Root);
    this.projectInfoTreeRoot.set(DefaultLevel1Root);
    this.lastRolledUpActionState.set(Reducer.initialActionState);
  }

  @method createProject(input: CreateProjectInput) {
    this.reducer.dispatch(
      new ProjectAction({
        projectId: Field(-1),
        members: input.members,
        ipfsHash: input.ipfsHash,
      })
    );
  }

  @method updateProjectInfo(input: UpdateProjectInput) {
    // check the right projectId
    let projectId = input.memberLevel1Witness.calculateIndex();
    projectId.assertEquals(input.projectId);

    // check only project created can be updated
    projectId.assertLessThan(this.nextProjectId.getAndAssertEquals());

    // check the right owner index
    let memberIndex = input.memberLevel2Witness.calculateIndex();
    memberIndex.assertEquals(Field(0));
    // check the same on root
    let memberLevel2Root = input.memberLevel2Witness.calculateRoot(
      Poseidon.hash(PublicKey.toFields(this.sender))
    );
    let memberLevel1Root =
      input.memberLevel1Witness.calculateRoot(memberLevel2Root);
    memberLevel1Root.assertEquals(this.memberTreeRoot.getAndAssertEquals());

    let lastRolledUpActionState =
      this.lastRolledUpActionState.getAndAssertEquals();

    // TODO: not really able to do this, check again. If both of them send at the same block
    // checking if the request have the same id already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: lastRolledUpActionState,
      }),
      Bool,
      (state: Bool, action: ProjectAction) => {
        return action.projectId.equals(projectId).or(state);
      },
      // initial state
      { state: Bool(false), actionState: lastRolledUpActionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    this.reducer.dispatch(
      new ProjectAction({
        projectId: input.projectId,
        members: input.members,
        ipfsHash: input.ipfsHash,
      })
    );
  }

  // Add memberIndex to input for checking
  @method checkProjectOwner(input: CheckProjectOwerInput): Bool {
    let isOwner = Bool(true);

    // check the right projectId
    let projectId = input.memberLevel1Witness.calculateIndex();
    isOwner = projectId.equals(input.projectId).and(isOwner);

    // check the right owner index
    let memberIndex = input.memberLevel2Witness.calculateIndex();
    isOwner = memberIndex.equals(Field(0)).and(isOwner);
    // check the same on root
    let memberLevel2Root = input.memberLevel2Witness.calculateRoot(
      Poseidon.hash(PublicKey.toFields(input.owner))
    );
    let memberLevel1Root =
      input.memberLevel1Witness.calculateRoot(memberLevel2Root);
    isOwner = memberLevel1Root
      .equals(this.memberTreeRoot.getAndAssertEquals())
      .and(isOwner);

    return isOwner;
  }
}

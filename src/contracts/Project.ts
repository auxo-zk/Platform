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

export class CheckOwerInput extends Struct({
  address: PublicKey,
  projectId: Field,
  memberWitness: FullMTWitness,
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

export class CreateProjectOutput extends Struct({}) {
  hash(): Field {
    return Poseidon.hash(CreateProjectOutput.toFields(this));
  }
}

export const CreateProject = ZkProgram({
  name: 'create-project',
  publicOutput: CreateProjectOutput,
  methods: {
    firstStep: {
      privateInputs: [],
      method(): CreateProjectOutput {
        return new CreateProjectOutput({});
      },
    },
    nextStep: {
      privateInputs: [SelfProof<Void, CreateProjectOutput>],
      method(
        preProof: SelfProof<Void, CreateProjectOutput>
      ): CreateProjectOutput {
        preProof.verify();
        return new CreateProjectOutput({});
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

  @method updateProjectInfo(input: UpdateProjectInput) {}

  // Add memberIndex to input for checking
  @method checkOwner(input: CheckOwerInput): Bool {
    return Bool(true);
  }
}

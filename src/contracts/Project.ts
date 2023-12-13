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
import { IPFSHash, PublicKeyDynamicArray } from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';
import { PROJECT_MEMBER_MAX_SIZE } from '../constants.js';
import {
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_2_TREE,
  Level1Witness,
  FullMTWitness,
} from './ProjectStorage.js';

const DefaultRoot = EMPTY_LEVEL_1_TREE().getRoot();

export class MemberArray extends PublicKeyDynamicArray(
  PROJECT_MEMBER_MAX_SIZE
) {}

export class ProjectAction extends Struct({
  addresses: MemberArray,
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
  COMMITTEE_CREATED = 'committee-created',
}

export class ProjectContract extends SmartContract {
  @state(Field) nextCommitteeId = State<Field>();
  @state(Field) memberTreeRoot = State<Field>();
  @state(Field) settingTreeRoot = State<Field>();

  @state(Field) actionState = State<Field>();

  reducer = Reducer({ actionType: ProjectAction });

  events = {
    [EventEnum.COMMITTEE_CREATED]: Field,
  };

  init() {
    super.init();
    this.memberTreeRoot.set(DefaultRoot);
    this.settingTreeRoot.set(DefaultRoot);
    this.actionState.set(Reducer.initialActionState);
  }

  @method createCommittee(action: ProjectAction) {}

  @method rollupIncrements() {}

  // Add memberIndex to input for checking
  @method checkOwner(input: CheckOwerInput): Bool {
    return Bool(true);
  }
}

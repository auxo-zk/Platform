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
import { updateOutOfSnark } from '../libs/utils.js';
import {
  EMPTY_LEVEL_1_TREE,
  Level1Witness,
  ClaimedStorage,
} from './TreasuryStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export class TreasuryAction extends Struct({
  campaignId: Field,
  projectId: Field,
}) {
  static fromFields(fields: Field[]): TreasuryAction {
    return super.fromFields(fields) as TreasuryAction;
  }
}

export class ClaimTreasuryInput extends Struct({
  canpaignId: Field,
  projectId: Field,
}) {
  static fromFields(fields: Field[]): ClaimTreasuryInput {
    return super.fromFields(fields) as ClaimTreasuryInput;
  }
}

export class CreateTreasuryProofOutput extends Struct({
  // initialClaimedTreeRoot: Field,
  // initialLastRolledUpACtionState: Field,
  // finalClaimedTreeRoot: Field,
  // finalLastRolledUpActionState: Field,
}) {
  hash(): Field {
    return Poseidon.hash(CreateTreasuryProofOutput.toFields(this));
  }
}

export const CreateTreasury = ZkProgram({
  name: 'create-treasury',
  publicOutput: CreateTreasuryProofOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field],
      method(
        initialClaimedTreeRoot,
        initialLastRolledUpACtionState
      ): CreateTreasuryProofOutput {
        return new CreateTreasuryProofOutput({
          // initialClaimedTreeRoot,
          // initialLastRolledUpACtionState,
          // finalClaimedTreeRoot: initialClaimedTreeRoot,
          // finalLastRolledUpActionState: initialLastRolledUpACtionState,
        });
      },
    },
    createTreasury: {
      privateInputs: [
        SelfProof<Void, CreateTreasuryProofOutput>,
        TreasuryAction,
      ],
      method(
        preProof: SelfProof<Void, CreateTreasuryProofOutput>,
        newAction: TreasuryAction
      ): CreateTreasuryProofOutput {
        preProof.verify();
        return new CreateTreasuryProofOutput({
          // initialClaimedTreeRoot: preProof.publicOutput.initialClaimedTreeRoot,
          // initialLastRolledUpACtionState:
          //   preProof.publicOutput.initialLastRolledUpACtionState,
          // finalClaimedTreeRoot: newClaimedTreeRoot,
          // finalLastRolledUpActionState: updateOutOfSnark(
          //   preProof.publicOutput.finalLastRolledUpActionState,
          //   [TreasuryAction.toFields(newAction)]
          // ),
        });
      },
    },
  },
});

class TreasuryProof extends ZkProgram.Proof(CreateTreasury) {}

export enum EventEnum {
  CAMPAIGN_CREATED = 'treasury-created',
}

export class TreasuryContract extends SmartContract {
  // store claimed status
  @state(Field) claimedTreeRoot = State<Field>();
  // MT of other zkApp address
  @state(Field) zkApps = State<Field>();
  @state(Field) lastRolledUpActionState = State<Field>();

  reducer = Reducer({ actionType: TreasuryAction });

  events = {
    [EventEnum.CAMPAIGN_CREATED]: Field,
  };

  init() {
    super.init();
    this.claimedTreeRoot.set(DefaultLevel1Root);
    this.lastRolledUpActionState.set(Reducer.initialActionState);
  }

  @method createTreasury(input: ClaimTreasuryInput) {
    this.reducer.dispatch(
      new TreasuryAction({
        campaignId: input.canpaignId,
        projectId: input.projectId,
      })
    );
  }

  @method rollup(proof: TreasuryProof) {
    proof.verify();
  }
}

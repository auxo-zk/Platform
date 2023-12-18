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
import {
  EMPTY_LEVEL_1_TREE,
  Level1Witness,
  StatusEnum,
  ConfigStorage,
} from './CampaignStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export class CampaignAction extends Struct({
  campaignId: Field,
  ipfsHash: IPFSHash,
  owner: PublicKey,
  campaignStatus: Field,
  committeeId: Field,
  keyId: Field,
}) {
  static fromFields(fields: Field[]): CampaignAction {
    return super.fromFields(fields) as CampaignAction;
  }
}

export class CheckCampaignOwerInput extends Struct({
  owner: PublicKey,
  campaignId: Field,
  ownerWitness: Level1Witness,
}) {}

export class CreateCampaignInput extends Struct({
  ipfsHash: IPFSHash,
  committeeId: Field,
  keyId: Field,
}) {
  static fromFields(fields: Field[]): CreateCampaignInput {
    return super.fromFields(fields) as CreateCampaignInput;
  }
}

export class UpdateCampaignInput extends Struct({}) {
  static fromFields(fields: Field[]): UpdateCampaignInput {
    return super.fromFields(fields) as UpdateCampaignInput;
  }
}

export class CreateCampaignProofOutput extends Struct({
  // initialNextCampaignId: Field,
  // initialMemberTreeRoot: Field,
  // initialCampaignInfoTreeRoot: Field,
  // initialLastRolledUpACtionState: Field,
  // finalNextCampaignId: Field,
  // finalMemberTreeRoot: Field,
  // finalCampaignInfoTreeRoot: Field,
  // finalLastRolledUpActionState: Field,
}) {
  hash(): Field {
    return Poseidon.hash(CreateCampaignProofOutput.toFields(this));
  }
}

export const CreateCampaign = ZkProgram({
  name: 'create-campaign',
  publicOutput: CreateCampaignProofOutput,
  methods: {
    firstStep: {
      privateInputs: [],
      method(): // initialNextCampaignId: Field,
      // initialMemberTreeRoot: Field,
      // initialCampaignInfoTreeRoot: Field,
      // initialLastRolledUpACtionState: Field
      CreateCampaignProofOutput {
        return new CreateCampaignProofOutput({
          // initialNextCampaignId,
          // initialMemberTreeRoot,
          // initialCampaignInfoTreeRoot,
          // initialLastRolledUpACtionState,
          // finalNextCampaignId: initialNextCampaignId,
          // finalMemberTreeRoot: initialMemberTreeRoot,
          // finalCampaignInfoTreeRoot: initialCampaignInfoTreeRoot,
          // finalLastRolledUpActionState: initialLastRolledUpACtionState,
        });
      },
    },
    nextStep: {
      privateInputs: [
        SelfProof<Void, CreateCampaignProofOutput>,
        CampaignAction,
        Level1Witness,
        Level1Witness,
      ],
      method(
        preProof: SelfProof<Void, CreateCampaignProofOutput>,
        newAction: CampaignAction,
        memberWitness: Level1Witness,
        campaignInfoWitess: Level1Witness
      ): CreateCampaignProofOutput {
        preProof.verify();

        return new CreateCampaignProofOutput({});
      },
    },
  },
});

class CampaignProof extends ZkProgram.Proof(CreateCampaign) {}

export enum EventEnum {
  CAMPAIGN_CREATED = 'campaign-created',
}

export class CampaignContract extends SmartContract {
  @state(Field) nextCampaignId = State<Field>();
  @state(Field) memberTreeRoot = State<Field>();
  @state(Field) campaignInfoTreeRoot = State<Field>();
  @state(Field) lastRolledUpActionState = State<Field>();

  reducer = Reducer({ actionType: CampaignAction });

  events = {
    [EventEnum.CAMPAIGN_CREATED]: Field,
  };

  init() {
    super.init();
    this.memberTreeRoot.set(DefaultLevel1Root);
    this.campaignInfoTreeRoot.set(DefaultLevel1Root);
    this.lastRolledUpActionState.set(Reducer.initialActionState);
  }

  @method createCampaign(input: CreateCampaignInput) {
    this.reducer.dispatch(
      new CampaignAction({
        campaignId: Field(-1),
        ipfsHash: input.ipfsHash,
        owner: this.sender,
        campaignStatus: Field(StatusEnum.APPLICATION),
        committeeId: input.committeeId,
        keyId: input.keyId,
      })
    );
  }

  @method updateCampaignInfo(input: UpdateCampaignInput) {}

  @method rollupIncrements(proof: CampaignProof) {
    proof.verify();
  }

  @method checkCampaignOwner(input: CheckCampaignOwerInput): Bool {
    let isOwner = Bool(true);

    return isOwner;
  }
}

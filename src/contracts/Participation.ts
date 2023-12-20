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
  ParticipantArray,
  ParticipantStorage,
  ApplicationStorage,
} from './ParticipationStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export class ParticipationAction extends Struct({
  campaignId: Field,
  projectId: Field,
  applicationInfo: IPFSHash,
}) {
  static fromFields(fields: Field[]): ParticipationAction {
    return super.fromFields(fields) as ParticipationAction;
  }
}

export class joinCampaignInput extends Struct({
  campaignId: Field,
  projectId: Field,
  applicationInfo: IPFSHash
}) {
  static fromFields(fields: Field[]): joinCampaignInput {
    return super.fromFields(fields) as joinCampaignInput;
  }
}

export class UpdateCampaignInput extends Struct({}) {
  static fromFields(fields: Field[]): UpdateCampaignInput {
    return super.fromFields(fields) as UpdateCampaignInput;
  }
}

export class CreateParticipationProofOutput extends Struct({}) {
  hash(): Field {
    return Poseidon.hash(CreateParticipationProofOutput.toFields(this));
  }
}

export const CreateCampaign = ZkProgram({
  name: 'create-campaign',
  publicOutput: CreateParticipationProofOutput,
  methods: {
    firstStep: {
      privateInputs: [],
      method(): CreateParticipationProofOutput {
        return new CreateParticipationProofOutput({});
      },
    },
    createCampaign: {
      privateInputs: [SelfProof<Void, CreateParticipationProofOutput>],
      method(
        preProof: SelfProof<Void, CreateParticipationProofOutput>
      ): CreateParticipationProofOutput {
        preProof.verify();

        return new CreateParticipationProofOutput({});
      },
    },
  },
});

class CampaignProof extends ZkProgram.Proof(CreateCampaign) {}

export enum EventEnum {
  CAMPAIGN_CREATED = 'campaign-created',
}

export class CampaignContract extends SmartContract {
  // store owner of campaign
  @state(Field) participantTreeRoot = State<Field>();
  // store IPFS hash of campaign
  @state(Field) applicationTreeRoot = State<Field>();

  // MT of other zkApp address
  @state(Field) zkApps = State<Field>();
  @state(Field) lastRolledUpActionState = State<Field>();

  reducer = Reducer({ actionType: ParticipationAction });

  events = {
    [EventEnum.CAMPAIGN_CREATED]: Field,
  };

  init() {
    super.init();
    this.participantTreeRoot.set(DefaultLevel1Root);
    this.applicationTreeRoot.set(DefaultLevel1Root);
    this.lastRolledUpActionState.set(Reducer.initialActionState);
  }

  @method joinCampaign(input: joinCampaignInput) {
    this.reducer.dispatch(
      new ParticipationAction({
        campaignId: input.campaignId,
        projectId: input.projectId,
        applicationInfo: input.applicationInfo,
      })
    );
  }

  // todo
  @method updateCampaignInfo(input: UpdateCampaignInput) {}

  @method rollup(proof: CampaignProof) {
    proof.verify();
  }
}

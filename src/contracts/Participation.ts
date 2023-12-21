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
  Level1Witness as applicationLv1Wintess,
  Level2Witness as applicationLv2Wintess,
  ApplicationStorage,
} from './ParticipationStorage.js';

import {
  Level1Witness as projectLv1Witness,
  Level2Witness as projectLv2Witness,
} from './ProjectStorage.js';
import { ProjectContract, CheckProjectOwerInput } from './Project.js';

import { ZkAppRef } from './SharedStorage.js';

import { ZkAppEnum } from '../constants.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export class ParticipationAction extends Struct({
  campaignId: Field,
  projectId: Field,
  applicationInfo: IPFSHash,
  curApplicationInfoHash: Field,
}) {
  static fromFields(fields: Field[]): ParticipationAction {
    return super.fromFields(fields) as ParticipationAction;
  }

  hashPIDandCID(): Field {
    return Poseidon.hash([this.campaignId, this.projectId]);
  }
}

export class joinCampaignInput extends Struct({
  campaignId: Field,
  projectId: Field,
  applicationInfo: IPFSHash,
  applicationLv1Wintess: applicationLv1Wintess,
  applicationLv2Wintess: applicationLv2Wintess,
  memberLv1Witness: projectLv1Witness,
  memberLv2Witness: projectLv2Witness,
}) {
  static fromFields(fields: Field[]): joinCampaignInput {
    return super.fromFields(fields) as joinCampaignInput;
  }
}

export class checkIfNotInCampaignInput extends Struct({
  campaignId: Field,
  projectId: Field,
  applicationLv1Wintess: applicationLv1Wintess,
  applicationLv2Wintess: applicationLv2Wintess,
}) {
  static fromFields(fields: Field[]): checkIfNotInCampaignInput {
    return super.fromFields(fields) as checkIfNotInCampaignInput;
  }
}

export class UpdateCampaignInput extends Struct({}) {
  static fromFields(fields: Field[]): UpdateCampaignInput {
    return super.fromFields(fields) as UpdateCampaignInput;
  }
}

export class CreateParticipationProofOutput extends Struct({
  initialApplicationTreeRoot: Field,
  initialLastRolledUpACtionState: Field,
  finalApplicationTreeRoot: Field,
  finalLastRolledUpActionState: Field,
}) {
  hash(): Field {
    return Poseidon.hash(CreateParticipationProofOutput.toFields(this));
  }
}

export const JoinCampaign = ZkProgram({
  name: 'join-campaign',
  publicOutput: CreateParticipationProofOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field],
      method(
        initialApplicationTreeRoot: Field,
        initialLastRolledUpACtionState: Field
      ): CreateParticipationProofOutput {
        return new CreateParticipationProofOutput({
          initialApplicationTreeRoot,
          initialLastRolledUpACtionState,
          finalApplicationTreeRoot: initialApplicationTreeRoot,
          finalLastRolledUpActionState: initialLastRolledUpACtionState,
        });
      },
    },
    createCampaign: {
      privateInputs: [
        SelfProof<Void, CreateParticipationProofOutput>,
        ParticipationAction,
        applicationLv1Wintess,
        applicationLv2Wintess,
      ],
      method(
        preProof: SelfProof<Void, CreateParticipationProofOutput>,
        newAction: ParticipationAction,
        // TODO: adding currentValue when update IPFS hash
        applicationLv1Wintess: applicationLv1Wintess,
        applicationLv2Wintess: applicationLv2Wintess
      ): CreateParticipationProofOutput {
        preProof.verify();

        // check right projectId and campaignId
        let lv1Index = applicationLv1Wintess.calculateIndex();
        lv1Index.assertEquals(newAction.campaignId);
        let lv2Index = applicationLv2Wintess.calculateIndex();
        lv2Index.assertEquals(newAction.projectId);

        // check have the same state with pre-proof states
        let lv2Root = applicationLv2Wintess.calculateRoot(
          newAction.curApplicationInfoHash
        );
        let lv1Root = applicationLv1Wintess.calculateRoot(lv2Root);
        lv1Root.assertEquals(preProof.publicOutput.finalApplicationTreeRoot);

        // caculate new state
        let newLv2Root = applicationLv2Wintess.calculateRoot(
          ApplicationStorage.calculateLeaf(newAction.applicationInfo)
        );
        let newLv1Root = applicationLv1Wintess.calculateRoot(newLv2Root);

        return new CreateParticipationProofOutput({
          initialApplicationTreeRoot:
            preProof.publicOutput.initialApplicationTreeRoot,
          initialLastRolledUpACtionState:
            preProof.publicOutput.initialLastRolledUpACtionState,
          finalApplicationTreeRoot: newLv1Root,
          finalLastRolledUpActionState: updateOutOfSnark(
            preProof.publicOutput.finalLastRolledUpActionState,
            [ParticipationAction.toFields(newAction)]
          ),
        });
      },
    },
  },
});

class ParticipationProof extends ZkProgram.Proof(JoinCampaign) {}

export class ParticipationContract extends SmartContract {
  // store IPFS hash of campaign
  @state(Field) applicationTreeRoot = State<Field>();
  // MT of other zkApp address
  @state(Field) zkApps = State<Field>();
  @state(Field) lastRolledUpActionState = State<Field>();

  reducer = Reducer({ actionType: ParticipationAction });

  init() {
    super.init();
    this.applicationTreeRoot.set(DefaultLevel1Root);
    this.lastRolledUpActionState.set(Reducer.initialActionState);
  }

  @method joinCampaign(input: joinCampaignInput, projectRef: ZkAppRef) {
    // TODO: check campaign status

    // check owner
    let zkApps = this.zkApps.getAndAssertEquals();

    // check project contract
    zkApps.assertEquals(
      projectRef.witness.calculateRoot(
        Poseidon.hash(projectRef.address.toFields())
      )
    );
    Field(ZkAppEnum.PROJECT).assertEquals(projectRef.witness.calculateIndex());

    let projectContract = new ProjectContract(projectRef.address);

    let isOwner = projectContract.checkProjectOwner(
      new CheckProjectOwerInput({
        owner: this.sender,
        projectId: input.projectId,
        memberLevel1Witness: input.memberLv1Witness,
        memberLevel2Witness: input.memberLv2Witness,
      })
    );

    isOwner.assertEquals(Bool(true));

    // check if this is first time join campaign

    let notIn = this.checkIfNotInCampaign(
      new checkIfNotInCampaignInput({
        campaignId: input.campaignId,
        projectId: input.projectId,
        applicationLv1Wintess: input.applicationLv1Wintess,
        applicationLv2Wintess: input.applicationLv2Wintess,
      })
    );

    notIn.assertEquals(Bool(true));

    // each project can only participate campaign once
    let lastRolledUpActionState =
      this.lastRolledUpActionState.getAndAssertEquals();

    let newAction = new ParticipationAction({
      campaignId: input.campaignId,
      projectId: input.projectId,
      applicationInfo: input.applicationInfo,
      curApplicationInfoHash: Field(0),
    });

    let chekcHash = newAction.hashPIDandCID();

    // TODO: not really able to do this, check again. If both of them send at the same block
    // checking if the request have the same id already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: lastRolledUpActionState,
      }),
      Bool,
      (state: Bool, action: ParticipationAction) => {
        return action.hashPIDandCID().equals(chekcHash).or(state);
      },
      // initial state
      { state: Bool(false), actionState: lastRolledUpActionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    this.reducer.dispatch(newAction);
  }

  // TODO: checkIfNotInCampaign change to check current project application
  @method updateCampaignInfo(input: UpdateCampaignInput) {}

  @method checkIfNotInCampaign(input: checkIfNotInCampaignInput): Bool {
    let notIn = Bool(true);

    // check the right projectId
    let campaignIndex = input.applicationLv1Wintess.calculateIndex();
    notIn = campaignIndex.equals(input.campaignId).and(notIn);

    // check the right owner index, is = 0
    let projectIndex = input.applicationLv2Wintess.calculateIndex();
    notIn = projectIndex.equals(input.projectId).and(notIn);

    // check the value is == Field(0)
    let level2Root = input.applicationLv2Wintess.calculateRoot(Field(0));
    let level1Root = input.applicationLv1Wintess.calculateRoot(level2Root);
    notIn = level1Root
      .equals(this.applicationTreeRoot.getAndAssertEquals())
      .and(notIn);

    return notIn;
  }

  @method rollup(proof: ParticipationProof) {
    proof.verify();
    let applicationTreeRoot = this.applicationTreeRoot.getAndAssertEquals();
    let lastRolledUpActionState =
      this.lastRolledUpActionState.getAndAssertEquals();

    applicationTreeRoot.assertEquals(
      proof.publicOutput.initialApplicationTreeRoot
    );
    lastRolledUpActionState.assertEquals(
      proof.publicOutput.initialLastRolledUpACtionState
    );

    let lastActionState = this.account.actionState.getAndAssertEquals();
    lastActionState.assertEquals(
      proof.publicOutput.finalLastRolledUpActionState
    );

    // update on-chain state
    this.applicationTreeRoot.set(proof.publicOutput.finalApplicationTreeRoot);
    this.lastRolledUpActionState.set(
      proof.publicOutput.finalLastRolledUpActionState
    );
  }
}

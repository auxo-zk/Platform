import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  Group,
  Reducer,
  MerkleMap,
  MerkleMapWitness,
  Struct,
  SelfProof,
  Poseidon,
  Provable,
  Void,
  Scalar,
  ZkProgram,
  Bool,
  UInt64,
  AccountUpdate,
} from 'o1js';

import {
  CustomScalar,
  GroupDynamicArray,
  ScalarDynamicArray,
} from '@auxo-dev/auxo-libs';
import { updateOutOfSnark } from '../libs/utils.js';

import {
  ZkApp as DKG_Contracts,
  Constants as DKG_Constants,
} from '@auxo-dev/dkg';

import { REQUEST_MAX_SIZE } from '@auxo-dev/dkg/build/esm/src/constants';

import { ZkAppEnum } from '../constants.js';

import { ActionStatus, ZkAppRef, EMPTY_REDUCE_MT } from './SharedStorage.js';

import {
  Level1Witness,
  EMPTY_LEVEL_1_TREE,
  ValueStorage,
} from './FundingStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export enum EventEnum {
  ACTIONS_REDUCED = 'actions-reduced',
  REQUEST_SENT = 'request-sent',
}

export class RequestSent extends Struct({
  campaignId: Field,
  committeeId: Field,
  keyId: Field,
  sumR: DKG_Contracts.Request.RequestVector,
  sumM: DKG_Contracts.Request.RequestVector,
}) {
  static fromFields(action: Field[]): RequestSent {
    return super.fromFields(action) as RequestSent;
  }
}

export class CustomScalarArray extends ScalarDynamicArray(
  DKG_Constants.REQUEST_MAX_SIZE
) {}

export class FundingInput extends Struct({
  campaignId: Field,
  committeeId: Field,
  keyId: Field,
  committeePublicKey: PublicKey,
  // TODO wintess to check if it the right publickey
  secretVector: CustomScalarArray,
  random: CustomScalarArray,
  // settingMerkleMapWitness: MerkleMapWitness,
  treasuryContract: ZkAppRef,
}) {}

export class FundingAction extends Struct({
  campaignId: Field,
  R: DKG_Contracts.Request.RequestVector,
  M: DKG_Contracts.Request.RequestVector,
}) {
  hash(): Field {
    return Poseidon.hash(FundingAction.toFields(this));
  }

  static fromFields(action: Field[]): FundingAction {
    return super.fromFields(action) as FundingAction;
  }
}

export class CheckValueInput extends Struct({
  campaignId: Field,
  Value: DKG_Contracts.Request.RequestVector,
}) {}

export class ReduceOutput extends Struct({
  // Actually don't need initialActionState, since we check initialActionStatus and finalActionState on-chain
  // Do this to increase security: from finding x,y that hash(x,y) = Z to finding x that hash(x,Y) = Z
  initialActionState: Field,
  initialActionStatus: Field,
  finalActionState: Field,
  finalActionStatus: Field,
}) {}

export const CreateReduceProof = ZkProgram({
  name: 'create-rollup-status',
  publicOutput: ReduceOutput,
  methods: {
    // First action to rollup
    firstStep: {
      privateInputs: [Field, Field],
      method(
        initialActionState: Field,
        initialActionStatus: Field
      ): ReduceOutput {
        return new ReduceOutput({
          initialActionState,
          initialActionStatus,
          finalActionState: initialActionState,
          finalActionStatus: initialActionStatus,
        });
      },
    },
    // Next actions to rollup
    nextStep: {
      privateInputs: [
        SelfProof<Void, ReduceOutput>,
        FundingAction,
        MerkleMapWitness,
      ],
      method(
        earlierProof: SelfProof<Void, ReduceOutput>,
        action: FundingAction,
        rollupStatusWitness: MerkleMapWitness
      ): ReduceOutput {
        // Verify earlier proof
        earlierProof.verify();

        // Calculate new action state == action id in the tree
        let newActionState = updateOutOfSnark(
          earlierProof.publicOutput.finalActionState,
          [FundingAction.toFields(action)]
        );

        // Current value of the action hash should be NOT_EXISTED
        let [root, key] = rollupStatusWitness.computeRootAndKey(
          Field(ActionStatus.NOT_EXISTED)
        );
        key.assertEquals(newActionState);
        root.assertEquals(earlierProof.publicOutput.finalActionStatus);

        // New value of the action hash = REDUCED
        [root] = rollupStatusWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );

        return new ReduceOutput({
          initialActionState: earlierProof.publicOutput.initialActionState,
          initialActionStatus: earlierProof.publicOutput.initialActionStatus,
          finalActionState: newActionState,
          finalActionStatus: root,
        });
      },
    },
  },
});
export class ReduceProof extends ZkProgram.Proof(CreateReduceProof) {}

export class RollupActionsOutput extends Struct({
  campaignId: Field,
  sum_R: DKG_Contracts.Request.RequestVector,
  sum_M: DKG_Contracts.Request.RequestVector,
  cur_T: Field,
  initialStatusRoot: Field,
  finalStatusRoot: Field,
}) {
  hash(): Field {
    return Poseidon.hash(RollupActionsOutput.toFields(this));
  }
}

export const CreateRollupProof = ZkProgram({
  name: 'rollup-actions',
  publicOutput: RollupActionsOutput,
  methods: {
    nextStep: {
      privateInputs: [
        SelfProof<Void, RollupActionsOutput>,
        FundingAction,
        Field,
        MerkleMapWitness,
      ],

      method(
        preProof: SelfProof<Void, RollupActionsOutput>,
        action: FundingAction,
        preActionState: Field,
        rollupStatusWitness: MerkleMapWitness
      ): RollupActionsOutput {
        preProof.verify();
        let campaignId = action.campaignId;
        campaignId.assertEquals(preProof.publicOutput.campaignId);

        let actionState = updateOutOfSnark(preActionState, [
          FundingAction.toFields(action),
        ]);

        // It's status has to be REDUCED
        let [root, key] = rollupStatusWitness.computeRootAndKey(
          Field(ActionStatus.REDUCED)
        );
        key.assertEquals(actionState);
        root.assertEquals(preProof.publicOutput.finalStatusRoot);

        // Update satus to ROLL_UPED
        let [newRoot] = rollupStatusWitness.computeRootAndKey(
          Field(ActionStatus.ROLL_UPED)
        );

        let sum_R = preProof.publicOutput.sum_R;
        let sum_M = preProof.publicOutput.sum_M;

        for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
          sum_R.set(Field(i), sum_R.get(Field(i)).add(action.R.get(Field(i))));
          sum_M.set(Field(i), sum_M.get(Field(i)).add(action.M.get(Field(i))));
        }

        return new RollupActionsOutput({
          campaignId: campaignId,
          sum_R,
          sum_M,
          cur_T: preProof.publicOutput.cur_T.add(Field(1)),
          initialStatusRoot: preProof.publicOutput.initialStatusRoot,
          finalStatusRoot: newRoot,
        });
      },
    },

    firstStep: {
      privateInputs: [Field, Field, Field],

      method(
        campaignId: Field,
        REQUEST_MAX_SIZE: Field,
        initialStatusRoot: Field
      ): RollupActionsOutput {
        return new RollupActionsOutput({
          campaignId,
          sum_R: DKG_Contracts.Request.RequestVector.empty(REQUEST_MAX_SIZE),
          sum_M: DKG_Contracts.Request.RequestVector.empty(REQUEST_MAX_SIZE),
          cur_T: Field(0),
          initialStatusRoot,
          finalStatusRoot: initialStatusRoot,
        });
      },
    },
  },
});

class ProofRollupAction extends ZkProgram.Proof(CreateRollupProof) {}

export class FundingContract extends SmartContract {
  @state(Field) actionState = State<Field>();
  @state(Field) actionStatus = State<Field>();
  @state(Field) R_Root = State<Field>(); // campaignId -> sum R
  @state(Field) M_Root = State<Field>(); // campaignId -> sum M
  @state(Field) zkApps = State<Field>();

  reducer = Reducer({ actionType: FundingAction });
  events = {
    [EventEnum.ACTIONS_REDUCED]: Field,
    [EventEnum.REQUEST_SENT]: RequestSent,
  };

  init() {
    super.init();
    this.actionState.set(Reducer.initialActionState);
    this.actionStatus.set(EMPTY_REDUCE_MT().getRoot());
    this.R_Root.set(DefaultLevel1Root);
    this.M_Root.set(DefaultLevel1Root);
  }

  @method fund(fundingInput: FundingInput): {
    R: DKG_Contracts.Request.RequestVector;
    M: DKG_Contracts.Request.RequestVector;
  } {
    let dimension = fundingInput.secretVector.length;
    let R = new DKG_Contracts.Request.RequestVector();
    let M = new DKG_Contracts.Request.RequestVector();
    // TODO: remove provable witness
    let totalMinaInvest = Provable.witness(Field, () => {
      let curSum = Scalar.from(0n);
      for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
        curSum.add(fundingInput.secretVector.get(Field(i)).toScalar());
      }
      return Field(curSum.toBigInt());
    });
    for (let i = 0; i < REQUEST_MAX_SIZE; i++) {
      let random = fundingInput.random.get(Field(i)).toScalar();
      R.push(
        Provable.if(
          Field(i).greaterThanOrEqual(dimension),
          Group.fromFields([Field(0), Field(0)]),
          Group.generator.scale(random)
        )
      );
      let M_i = Provable.if(
        Poseidon.hash(
          fundingInput.secretVector.get(Field(i)).toFields()
        ).equals(Poseidon.hash([Field(0), Field(0)])),
        Group.zero.add(fundingInput.committeePublicKey.toGroup().scale(random)),
        Group.generator
          .scale(fundingInput.secretVector.get(Field(i)).toScalar())
          .add(fundingInput.committeePublicKey.toGroup().scale(random))
      );
      M_i = Provable.if(
        Field(i).greaterThanOrEqual(dimension),
        Group.fromFields([Field(0), Field(0)]),
        M_i
      );
      M.push(M_i);
    }
    let dercementAmount = Field(REQUEST_MAX_SIZE).sub(dimension);
    R.decrementLength(dercementAmount);
    M.decrementLength(dercementAmount);

    // Verify zkApp references
    let zkApps = this.zkApps.getAndRequireEquals();

    // TreasuryContract
    zkApps.assertEquals(
      fundingInput.treasuryContract.witness.calculateRoot(
        Poseidon.hash(fundingInput.treasuryContract.address.toFields())
      )
    );
    Field(ZkAppEnum.TREASURY).assertEquals(
      fundingInput.treasuryContract.witness.calculateIndex()
    );

    let requester = AccountUpdate.createSigned(this.sender);
    // Send invest Mina to treasury contract
    requester.send({
      to: fundingInput.treasuryContract.address,
      amount: UInt64.from(totalMinaInvest),
    });

    this.reducer.dispatch(
      new FundingAction({
        campaignId: fundingInput.campaignId,
        R,
        M,
      })
    );

    return { R, M };
  }

  @method reduce(proof: ReduceProof) {
    // Verify proof
    proof.verify();

    // assert initialActionState
    let actionState = this.actionState.getAndRequireEquals();
    proof.publicOutput.initialActionState.assertEquals(actionState);

    // assert initialActionStatus
    let actionStatus = this.actionStatus.getAndRequireEquals();
    proof.publicOutput.initialActionStatus.assertEquals(actionStatus);

    // assert finalActionState
    let lastActionState = this.account.actionState.getAndRequireEquals();
    lastActionState.assertEquals(proof.publicOutput.finalActionState);

    this.actionState.set(lastActionState);
    this.actionStatus.set(proof.publicOutput.finalActionStatus);

    // Emit events
    this.emitEvent(EventEnum.ACTIONS_REDUCED, lastActionState);
  }

  // TODO: adding N, T to check REQUEST_MAX_SIZE by interact with Committee contract
  // TODO: checking Campaign contract -> committeeId and keyId
  @method rollupRequest(
    proof: ProofRollupAction,
    committeeId: Field,
    keyId: Field,
    R_wintess: MerkleMapWitness,
    M_wintess: MerkleMapWitness,
    requestZkAppRef: ZkAppRef
  ) {
    proof.verify();

    let R_Root = this.R_Root.getAndRequireEquals();
    let M_Root = this.M_Root.getAndRequireEquals();
    let actionStatus = this.actionStatus.getAndRequireEquals();

    actionStatus.assertEquals(proof.publicOutput.initialStatusRoot);
    let [old_R_root, R_key] = R_wintess.computeRootAndKey(Field(0));
    let [old_M_root, M_key] = M_wintess.computeRootAndKey(Field(0));

    R_key.assertEquals(proof.publicOutput.campaignId);
    M_key.assertEquals(proof.publicOutput.campaignId);

    R_Root.assertEquals(old_R_root);
    M_Root.assertEquals(old_M_root);

    // TODO: adding check cur_T == T
    let [new_R_root] = R_wintess.computeRootAndKey(
      ValueStorage.calculateLeaf(proof.publicOutput.sum_R)
    );
    let [new_M_root] = M_wintess.computeRootAndKey(
      ValueStorage.calculateLeaf(proof.publicOutput.sum_M)
    );

    // update on-chain state
    this.R_Root.set(new_R_root);
    this.M_Root.set(new_M_root);
    this.actionStatus.set(proof.publicOutput.finalStatusRoot);

    // TODO: request to Request contract
    // Verify zkApp references
    let zkApps = this.zkApps.getAndRequireEquals();

    // TreasuryContract
    zkApps.assertEquals(
      requestZkAppRef.witness.calculateRoot(
        Poseidon.hash(requestZkAppRef.address.toFields())
      )
    );
    Field(ZkAppEnum.REQUEST).assertEquals(
      requestZkAppRef.witness.calculateIndex()
    );

    // Create & dispatch action to RequestContract
    const requestZkApp = new DKG_Contracts.Request.RequestContract(
      requestZkAppRef.address
    );
    requestZkApp.request(
      new DKG_Contracts.Request.RequestInput({
        committeeId,
        keyId,
        R: proof.publicOutput.sum_R,
      })
    );

    this.emitEvent(
      EventEnum.REQUEST_SENT,
      new RequestSent({
        campaignId: proof.publicOutput.campaignId,
        committeeId,
        keyId,
        sumR: proof.publicOutput.sum_R,
        sumM: proof.publicOutput.sum_M,
      })
    );
  }

  @method checkMvalue(
    campaignId: Field,
    M: DKG_Contracts.Request.RequestVector,
    wintess: Level1Witness
  ): Bool {
    let isCorrect = Bool(true);

    let caculateCampaignId = wintess.calculateIndex();
    isCorrect = isCorrect.and(campaignId.equals(caculateCampaignId));

    let M_root_on_chain = this.M_Root.getAndRequireEquals();
    let calculateM = wintess.calculateRoot(ValueStorage.calculateLeaf(M));
    isCorrect = isCorrect.and(M_root_on_chain.equals(calculateM));

    return isCorrect;
  }

  @method checkRvalue(
    campaignId: Field,
    R: DKG_Contracts.Request.RequestVector,
    wintess: Level1Witness
  ): Bool {
    let isCorrect = Bool(true);

    let caculateCampaignId = wintess.calculateIndex();
    isCorrect = isCorrect.and(campaignId.equals(caculateCampaignId));

    let R_root_on_chain = this.R_Root.getAndRequireEquals();
    let calculateR = wintess.calculateRoot(ValueStorage.calculateLeaf(R));
    isCorrect = isCorrect.and(R_root_on_chain.equals(calculateR));

    return isCorrect;
  }
}

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
  MerkleMap,
  MerkleMapWitness,
  Group,
  Scalar,
  UInt64,
} from 'o1js';
import { updateOutOfSnark } from '../libs/utils.js';

import { FieldDynamicArray } from '@auxo-dev/auxo-libs';

import { ZkAppRef } from './SharedStorage.js';

import {
  EMPTY_LEVEL_1_TREE,
  Level1CWitness,
  ClaimedStorage,
} from './TreasuryStorage.js';

import { ZkApp } from '@auxo-dev/dkg';

import { FundingContract, CheckValueInput } from './Funding.js';

import {
  ParticipationContract,
  checkParticipationIndexInput,
} from './Participation.js';

import { INSTANCE_LIMITS, ZkAppEnum } from '../constants.js';

import { Level1CWitness as indexWitness } from './ParticipationStorage.js';

const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();

export class InvestVector extends FieldDynamicArray(
  INSTANCE_LIMITS.PARTICIPATION
) {}

export class TreasuryAction extends Struct({
  campaignId: Field,
  projectId: Field,
}) {
  static fromFields(fields: Field[]): TreasuryAction {
    return super.fromFields(fields) as TreasuryAction;
  }

  id(): Field {
    return Poseidon.hash([this.campaignId, this.projectId]);
  }
}

export class ClaimFundInput extends Struct({
  campaignId: Field,
  projectId: Field,
  committeeId: Field,
  keyId: Field,
  //TODO: project config publickey witness
  payeeAddress: PublicKey,
  //TODO: campaign config witness
  R: ZkApp.Request.RequestVector,
  M: ZkApp.Request.RequestVector,
  D: ZkApp.Request.RequestVector,
  DWitness: MerkleMapWitness,
  investVector: InvestVector,
  participationIndex: Field,
  indexWitness: indexWitness,
  claimedIndex: Level1CWitness,
  participationRef: ZkAppRef,
}) {
  static fromFields(fields: Field[]): ClaimFundInput {
    return super.fromFields(fields) as ClaimFundInput;
  }
}

export class CheckIfNotClaimedInput extends Struct({
  campaignId: Field,
  projectId: Field,
  claimedIndex: Level1CWitness,
}) {
  static fromFields(fields: Field[]): CheckIfNotClaimedInput {
    return super.fromFields(fields) as CheckIfNotClaimedInput;
  }
}

export class ClaimFundProofOutput extends Struct({
  initialClaimedTreeRoot: Field,
  initiallastReducedActionState: Field,
  finalClaimedTreeRoot: Field,
  finallastReducedActionState: Field,
}) {
  hash(): Field {
    return Poseidon.hash(ClaimFundProofOutput.toFields(this));
  }
}

export const ClaimFund = ZkProgram({
  name: 'claim-fund',
  publicOutput: ClaimFundProofOutput,
  methods: {
    firstStep: {
      privateInputs: [Field, Field],
      method(
        initialClaimedTreeRoot,
        initiallastReducedActionState
      ): ClaimFundProofOutput {
        return new ClaimFundProofOutput({
          initialClaimedTreeRoot,
          initiallastReducedActionState,
          finalClaimedTreeRoot: initialClaimedTreeRoot,
          finallastReducedActionState: initiallastReducedActionState,
        });
      },
    },
    createTreasury: {
      privateInputs: [
        SelfProof<Void, ClaimFundProofOutput>,
        TreasuryAction,
        Level1CWitness,
      ],
      method(
        preProof: SelfProof<Void, ClaimFundProofOutput>,
        newAction: TreasuryAction,
        claimedIndex: Level1CWitness
      ): ClaimFundProofOutput {
        preProof.verify();

        let index = ClaimedStorage.calculateLevel1Index({
          campaignId: newAction.campaignId,
          projectId: newAction.projectId,
        });
        index.assertEquals(claimedIndex.calculateIndex());

        let curClaimedTreeRoot = claimedIndex.calculateRoot(Field(0));
        curClaimedTreeRoot.assertEquals(
          preProof.publicOutput.finalClaimedTreeRoot
        );

        let newClaimedTreeRoot = claimedIndex.calculateRoot(
          ClaimedStorage.calculateLeaf(Bool(true))
        );

        return new ClaimFundProofOutput({
          initialClaimedTreeRoot: preProof.publicOutput.initialClaimedTreeRoot,
          initiallastReducedActionState:
            preProof.publicOutput.initiallastReducedActionState,
          finalClaimedTreeRoot: newClaimedTreeRoot,
          finallastReducedActionState: updateOutOfSnark(
            preProof.publicOutput.finallastReducedActionState,
            [TreasuryAction.toFields(newAction)]
          ),
        });
      },
    },
  },
});

class TreasuryProof extends ZkProgram.Proof(ClaimFund) {}

export enum EventEnum {
  ACTION_REDUCED = 'action_reduced',
}

export class TreasuryContract extends SmartContract {
  // store claimed status
  @state(Field) claimedTreeRoot = State<Field>();
  // MT of other zkApp address
  @state(Field) zkApps = State<Field>();
  @state(Field) lastReducedActionState = State<Field>();

  reducer = Reducer({ actionType: TreasuryAction });

  events = {
    [EventEnum.ACTION_REDUCED]: Field,
  };

  init() {
    super.init();
    this.claimedTreeRoot.set(DefaultLevel1Root);
    this.lastReducedActionState.set(Reducer.initialActionState);
  }

  @method claimFund(input: ClaimFundInput) {
    // TODO: check campaign config
    // TODO: check D value in contract Request

    let action = new TreasuryAction({
      campaignId: input.campaignId,
      projectId: input.projectId,
    });

    let id = action.id();

    let lastReducedActionState =
      this.lastReducedActionState.getAndRequireEquals();

    // TODO: not really able to do this, check again. If both of them send at the same block
    // checking if the request have the same id already exists within the accumulator
    let { state: exists } = this.reducer.reduce(
      this.reducer.getActions({
        fromActionState: lastReducedActionState,
      }),
      Bool,
      (state: Bool, action: TreasuryAction) => {
        return action.id().equals(id).or(state);
      },
      // initial state
      { state: Bool(false), actionState: lastReducedActionState }
    );

    // if exists then don't dispatch any more
    exists.assertEquals(Bool(false));

    for (let i = 0; i < INSTANCE_LIMITS.PARTICIPATION; i++) {
      let sumMsubSumD = input.M.get(Field(i)).sub(input.D.get(Field(i)));
      let point = Provable.witness(Group, () => {
        return Group.generator.scale(
          Scalar.from(input.investVector.get(Field(i)).toBigInt())
        );
      });
      point.x.assertEquals(sumMsubSumD.x);
      point.y.assertEquals(sumMsubSumD.y);
    }

    let zkApps = this.zkApps.getAndRequireEquals();
    // Verify zkApp references
    zkApps.assertEquals(
      input.participationRef.witness.calculateRoot(
        Poseidon.hash(input.participationRef.address.toFields())
      )
    );
    Field(ZkAppEnum.PARTICIPATION).assertEquals(
      input.participationRef.witness.calculateIndex()
    );

    // TODO: check this latter
    // const participationContract = new ParticipationContract(
    //   input.participationRef.address
    // );

    // participationContract
    //   .checkParticipationIndex(
    //     new checkParticipationIndexInput({
    //       campaignId: input.campaignId,
    //       projectId: input.projectId,
    //       participationIndex: input.participationIndex,
    //       indexWitness: input.indexWitness,
    //     })
    //   )
    //   .assertEquals(Bool(true));

    // check if claimed
    this.checkIfNotClaimed(
      new CheckIfNotClaimedInput({
        campaignId: input.campaignId,
        projectId: input.projectId,
        claimedIndex: input.claimedIndex,
      })
    ).assertEquals(Bool(true));

    let claimAmount = input.investVector.get(
      input.participationIndex.sub(Field(1)) // since index start from 1
    );

    // send invest amount
    this.send({ to: input.payeeAddress, amount: UInt64.from(claimAmount) });

    this.reducer.dispatch(action);
  }

  @method rollup(proof: TreasuryProof) {
    proof.verify();

    this.emitEvent(EventEnum.ACTION_REDUCED, Field(0));
  }

  @method checkIfNotClaimed(input: CheckIfNotClaimedInput): Bool {
    let isNotClaimed = Bool(true);

    let index = ClaimedStorage.calculateLevel1Index({
      campaignId: input.campaignId,
      projectId: input.projectId,
    });
    isNotClaimed = isNotClaimed.and(
      index.equals(input.claimedIndex.calculateIndex())
    );

    let curClaimedTreeRoot = this.claimedTreeRoot.getAndRequireEquals();
    isNotClaimed = isNotClaimed.and(
      curClaimedTreeRoot.equals(input.claimedIndex.calculateRoot(Field(0)))
    );

    return isNotClaimed;
  }
}

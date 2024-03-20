import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Group,
    Reducer,
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
class TreasuryManagerAction extends Struct({
    campaignId: Field,
    actionType: Field,
}) {}

class TreasuryManagerContract extends SmartContract {
    @state(Field) campaignResultRoot = State<Field>();
    @state(Field) campaignResultStateRoot = State<Field>();
    @state(Field) claimedIndexRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    init(): void {
        super.init();
    }

    @method completeCampaign() {
        //
    }

    @method abortCampaign() {
        //
    }

    @method claimFund() {
        //
    }

    @method refund() {
        // require call from FundingContract
    }

    @method rollup() {
        //
    }

    isCompleted() {
        //
    }

    isAborted() {
        //
    }
}

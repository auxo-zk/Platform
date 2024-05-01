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

import { CustomScalar, ScalarDynamicArray, Utils } from '@auxo-dev/auxo-libs';

import {
    DefaultRootForCommitmentMap,
    CommitmentStorage,
    CommitmentLevel1Witness,
} from '../storages/CommitmentStorage.js';

export {
    CommitmentContract,
    RollupCommitmentProof,
    RollupCommitment,
    RollupProjectOutput,
    CommitmentAction,
};

class CommitmentAction extends Struct({
    commitment: Field,
}) {
    static fromFields(fields: Field[]): CommitmentAction {
        return super.fromFields(fields) as CommitmentAction;
    }
}

class RollupProjectOutput extends Struct({
    initialCommitmentRoot: Field,
    initialActionState: Field,
    nextCommitmentRoot: Field,
    nextActionState: Field,
}) {}

const RollupCommitment = ZkProgram({
    name: 'RollupCommitment',
    publicOutput: RollupProjectOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field],
            async method(
                initialCommitmentRoot: Field,
                initialActionState: Field
            ): Promise<RollupProjectOutput> {
                return new RollupProjectOutput({
                    initialCommitmentRoot,
                    initialActionState,
                    nextCommitmentRoot: initialCommitmentRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        commit: {
            privateInputs: [
                SelfProof<Void, RollupProjectOutput>,
                CommitmentAction,
                CommitmentLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupProjectOutput>,
                commitmentAction: CommitmentAction,
                commitmentWitness: CommitmentLevel1Witness
            ): Promise<RollupProjectOutput> {
                earlierProof.verify();

                const [root, key] = commitmentWitness.computeRootAndKey(
                    Field(0)
                );

                root.assertEquals(earlierProof.publicOutput.nextCommitmentRoot);
                key.assertEquals(commitmentAction.commitment);

                const [nextCommitmentRoot, _] =
                    commitmentWitness.computeRootAndKey(
                        CommitmentStorage.calculateLeaf(Bool(true))
                    );

                const nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [CommitmentAction.toFields(commitmentAction)]
                );

                return new RollupProjectOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextCommitmentRoot,
                        nextActionState,
                    },
                });
            },
        },
    },
});

class RollupCommitmentProof extends ZkProgram.Proof(RollupCommitment) {}

class CommitmentContract extends SmartContract {
    @state(Field) commitmentRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: CommitmentAction });

    init(): void {
        super.init();
        this.commitmentRoot.set(DefaultRootForCommitmentMap);
        this.actionState.set(Reducer.initialActionState);
    }

    @method async commit(
        nullifier: Field,
        projectId: Field,
        vestingId: Field,
        commitmentWitness: CommitmentLevel1Witness
    ) {
        const commitment = CommitmentStorage.calculateLevel1Index({
            nullifier,
            projectId,
            vestingId,
        });

        // is not yet committed
        this.isCommitted(commitment, commitmentWitness).assertFalse();

        this.reducer.dispatch(new CommitmentAction({ commitment }));
    }

    @method async rollup(RollupCommitmentProof: RollupCommitmentProof) {
        const commitmentRoot = this.commitmentRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        commitmentRoot.assertEquals(
            RollupCommitmentProof.publicOutput.initialCommitmentRoot
        );
        actionState.assertEquals(
            RollupCommitmentProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(RollupCommitmentProof.publicOutput.nextActionState);

        this.commitmentRoot.set(
            RollupCommitmentProof.publicOutput.nextCommitmentRoot
        );
        this.actionState.set(
            RollupCommitmentProof.publicOutput.nextActionState
        );
    }

    isCommitted(
        commitment: Field,
        commitmentWitness: CommitmentLevel1Witness
    ): Bool {
        // TODO: check in reducer too

        const [root, key] = commitmentWitness.computeRootAndKey(Field(0));
        key.assertEquals(commitment);

        const commitmentRoot = this.commitmentRoot.getAndRequireEquals();

        return root.equals(commitmentRoot).not();
    }
}

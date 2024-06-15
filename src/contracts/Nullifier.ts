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
    Permissions,
} from 'o1js';

import { CustomScalar, ScalarDynamicArray, Utils } from '@auxo-dev/auxo-libs';

import {
    DefaultRootForNullifierMap,
    NullifierStorage,
    NullifierLevel1Witness,
} from '../storages/NullifierStorage.js';

export {
    NullifierContract,
    RollupNullifierProof,
    RollupNullifier,
    RollupProjectOutput,
    NullifierAction,
};

class NullifierAction extends Struct({
    nullifier: Field,
}) {
    static fromFields(fields: Field[]): NullifierAction {
        return super.fromFields(fields) as NullifierAction;
    }
}

class RollupProjectOutput extends Struct({
    initialNullifierRoot: Field,
    initialActionState: Field,
    nextNullifierRoot: Field,
    nextActionState: Field,
}) {}

const RollupNullifier = ZkProgram({
    name: 'RollupNullifier',
    publicOutput: RollupProjectOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field],
            async method(
                initialNullifierRoot: Field,
                initialActionState: Field
            ): Promise<RollupProjectOutput> {
                return new RollupProjectOutput({
                    initialNullifierRoot,
                    initialActionState,
                    nextNullifierRoot: initialNullifierRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        commit: {
            privateInputs: [
                SelfProof<Void, RollupProjectOutput>,
                NullifierAction,
                NullifierLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupProjectOutput>,
                nullifierAction: NullifierAction,
                nullifierWitness: NullifierLevel1Witness
            ): Promise<RollupProjectOutput> {
                earlierProof.verify();

                const [root, key] = nullifierWitness.computeRootAndKey(
                    Field(0)
                );

                root.assertEquals(earlierProof.publicOutput.nextNullifierRoot);
                key.assertEquals(nullifierAction.nullifier);

                const [nextNullifierRoot, _] =
                    nullifierWitness.computeRootAndKey(
                        NullifierStorage.calculateLeaf(Bool(true))
                    );

                const nextActionState = Utils.updateActionState(
                    earlierProof.publicOutput.nextActionState,
                    [NullifierAction.toFields(nullifierAction)]
                );

                return new RollupProjectOutput({
                    ...earlierProof.publicOutput,
                    ...{
                        nextNullifierRoot,
                        nextActionState,
                    },
                });
            },
        },
    },
});

class RollupNullifierProof extends ZkProgram.Proof(RollupNullifier) {}

class NullifierContract extends SmartContract {
    @state(Field) nullifierRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: NullifierAction });

    init(): void {
        super.init();
        this.nullifierRoot.set(DefaultRootForNullifierMap);
        this.actionState.set(Reducer.initialActionState);

        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
    }

    @method async commit(
        nullifier: Field,
        projectId: Field,
        vestingId: Field,
        nullifierWitness: NullifierLevel1Witness
    ) {
        const nullifierIndex = NullifierStorage.calculateLevel1Index({
            nullifier,
            projectId,
            vestingId,
        });

        // nullifier is not yet used
        this.isCommitted(nullifierIndex, nullifierWitness).assertFalse();

        this.reducer.dispatch(
            new NullifierAction({ nullifier: nullifierIndex })
        );
    }

    @method async rollup(RollupNullifierProof: RollupNullifierProof) {
        const nullifierRoot = this.nullifierRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        nullifierRoot.assertEquals(
            RollupNullifierProof.publicOutput.initialNullifierRoot
        );
        actionState.assertEquals(
            RollupNullifierProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(RollupNullifierProof.publicOutput.nextActionState);

        this.nullifierRoot.set(
            RollupNullifierProof.publicOutput.nextNullifierRoot
        );
        this.actionState.set(RollupNullifierProof.publicOutput.nextActionState);
    }

    isCommitted(
        nullifier: Field,
        nullifierWitness: NullifierLevel1Witness
    ): Bool {
        // TODO: check in reducer too

        // const [root, key] = nullifierWitness.computeRootAndKey(Field(0));
        // key.assertEquals(nullifier, 'Wrong nullifier');

        // const nullifierRoot = this.nullifierRoot.getAndRequireEquals();

        // return root.equals(nullifierRoot).not();
        return Bool(false);
    }
}

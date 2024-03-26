import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Reducer,
    Struct,
    SelfProof,
    Provable,
    ZkProgram,
    PublicKey,
    Void,
    Bool,
} from 'o1js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { INSTANCE_LIMITS } from '../Constants.js';
import {
    MemberArray,
    ProjectActionEnum,
    ProjectMemberStorage,
    IpfsHashStorage,
    TreasuryAddressStorage,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    DefaultRootForProjectTree,
    ProjectMemberLevel1Witness,
    ProjectMemberLevel2Witness,
    IpfsHashLevel1Witness,
    TreasuryAddressLevel1Witness,
} from '../storages/ProjectStorage.js';

export {
    ProjectAction,
    ProjectContract,
    RollupProject,
    RollupProjectOutput,
    RollupProjectProof,
};

class ProjectAction extends Struct({
    actionType: Field,
    projectId: Field,
    members: MemberArray,
    ipfsHash: IpfsHash,
    treasuryAddress: PublicKey,
}) {
    static fromFields(fields: Field[]): ProjectAction {
        return super.fromFields(fields) as ProjectAction;
    }
}

class RollupProjectOutput extends Struct({
    initialProjectId: Field,
    initialMemberRoot: Field,
    initialIpfsHashRoot: Field,
    initialTreasuryAddressRoot: Field,
    initialActionState: Field,
    nextProjectId: Field,
    nextMemberRoot: Field,
    nextIpfsHashRoot: Field,
    nextTreasuryAddressRoot: Field,
    nextActionState: Field,
}) {}

const RollupProject = ZkProgram({
    name: 'RollupProject',
    publicOutput: RollupProjectOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field, Field],
            method(
                initialProjectId: Field,
                initialMemberRoot: Field,
                initialIpfsHashRoot: Field,
                initialTreasuryAddressRoot: Field,
                initialActionState: Field
            ): RollupProjectOutput {
                return new RollupProjectOutput({
                    initialProjectId: initialProjectId,
                    initialMemberRoot: initialMemberRoot,
                    initialIpfsHashRoot: initialIpfsHashRoot,
                    initialTreasuryAddressRoot: initialTreasuryAddressRoot,
                    initialActionState: initialActionState,
                    nextProjectId: initialProjectId,
                    nextMemberRoot: initialMemberRoot,
                    nextIpfsHashRoot: initialIpfsHashRoot,
                    nextTreasuryAddressRoot: initialTreasuryAddressRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        createProjectStep: {
            privateInputs: [
                SelfProof<Void, RollupProjectOutput>,
                ProjectAction,
                ProjectMemberLevel1Witness,
                IpfsHashLevel1Witness,
                TreasuryAddressLevel1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupProjectOutput>,
                projectAction: ProjectAction,
                memberWitness: ProjectMemberLevel1Witness,
                ipfsHashWitness: IpfsHashLevel1Witness,
                treasuryAddressWitness: TreasuryAddressLevel1Witness
            ) {
                earlierProof.verify();
                projectAction.actionType.assertEquals(
                    Field(ProjectActionEnum.CREATE_PROJECT)
                );

                memberWitness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextProjectId);
                memberWitness
                    .calculateRoot(Field(0))
                    .assertEquals(earlierProof.publicOutput.nextMemberRoot);
                ipfsHashWitness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextProjectId);
                ipfsHashWitness
                    .calculateRoot(Field(0))
                    .assertEquals(earlierProof.publicOutput.nextIpfsHashRoot);
                treasuryAddressWitness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextProjectId);
                treasuryAddressWitness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextTreasuryAddressRoot
                    );

                const memberTree = EMPTY_LEVEL_2_PROJECT_MEMBER_TREE();
                for (
                    let i = 0;
                    i < INSTANCE_LIMITS.PROJECT_MEMBER_TREE_SIZE;
                    i++
                ) {
                    let value = Provable.if(
                        Field(i).greaterThanOrEqual(
                            projectAction.members.length
                        ),
                        Field(0),
                        MemberArray.hash(projectAction.members.get(Field(i)))
                    );
                    memberTree.setLeaf(BigInt(i), value);
                }
                const nextMemberRoot = memberWitness.calculateRoot(
                    memberTree.getRoot()
                );
                const nextIpfsHashRoot = ipfsHashWitness.calculateRoot(
                    IpfsHashStorage.calculateLeaf(projectAction.ipfsHash)
                );
                const nextTreasuryAddressRoot =
                    treasuryAddressWitness.calculateRoot(
                        TreasuryAddressStorage.calculateLeaf(
                            projectAction.treasuryAddress
                        )
                    );
                return new RollupProjectOutput({
                    initialProjectId:
                        earlierProof.publicOutput.initialProjectId,
                    initialMemberRoot:
                        earlierProof.publicOutput.initialMemberRoot,
                    initialIpfsHashRoot:
                        earlierProof.publicOutput.initialIpfsHashRoot,
                    initialTreasuryAddressRoot:
                        earlierProof.publicOutput.initialTreasuryAddressRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextProjectId:
                        earlierProof.publicOutput.nextProjectId.add(1),
                    nextMemberRoot: nextMemberRoot,
                    nextIpfsHashRoot: nextIpfsHashRoot,
                    nextTreasuryAddressRoot: nextTreasuryAddressRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [ProjectAction.toFields(projectAction)]
                    ),
                });
            },
        },
        updateProjectStep: {
            privateInputs: [
                SelfProof<Void, RollupProjectOutput>,
                ProjectAction,
                IpfsHash,
                IpfsHashLevel1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupProjectOutput>,
                projectAction: ProjectAction,
                currentIpfsHash: IpfsHash,
                ipfsHashWitness: IpfsHashLevel1Witness
            ) {
                earlierProof.verify();
                projectAction.actionType.assertEquals(
                    Field(ProjectActionEnum.UPDATE_PROJECT)
                );
                ipfsHashWitness
                    .calculateIndex()
                    .assertEquals(projectAction.projectId);
                ipfsHashWitness
                    .calculateRoot(
                        IpfsHashStorage.calculateLeaf(currentIpfsHash)
                    )
                    .assertEquals(earlierProof.publicOutput.nextIpfsHashRoot);

                const nextIpfsHashRoot = ipfsHashWitness.calculateRoot(
                    IpfsHashStorage.calculateLeaf(projectAction.ipfsHash)
                );
                return new RollupProjectOutput({
                    initialProjectId:
                        earlierProof.publicOutput.initialProjectId,
                    initialMemberRoot:
                        earlierProof.publicOutput.initialMemberRoot,
                    initialIpfsHashRoot:
                        earlierProof.publicOutput.initialIpfsHashRoot,
                    initialTreasuryAddressRoot:
                        earlierProof.publicOutput.initialTreasuryAddressRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextProjectId: earlierProof.publicOutput.nextProjectId,
                    nextMemberRoot: earlierProof.publicOutput.nextMemberRoot,
                    nextIpfsHashRoot: nextIpfsHashRoot,
                    nextTreasuryAddressRoot:
                        earlierProof.publicOutput.nextTreasuryAddressRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [ProjectAction.toFields(projectAction)]
                    ),
                });
            },
        },
    },
});

class RollupProjectProof extends ZkProgram.Proof(RollupProject) {}

class ProjectContract extends SmartContract {
    @state(Field) nextProjectId = State<Field>();
    @state(Field) memberRoot = State<Field>();
    @state(Field) ipfsHashRoot = State<Field>();
    @state(Field) treasuryAddressRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: ProjectAction });

    init() {
        super.init();
        this.nextProjectId.set(Field(0));
        this.memberRoot.set(DefaultRootForProjectTree);
        this.ipfsHashRoot.set(DefaultRootForProjectTree);
        this.treasuryAddressRoot.set(DefaultRootForProjectTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method createProject(
        members: MemberArray,
        ipfsHash: IpfsHash,
        treasuryAddress: PublicKey
    ) {
        this.reducer.dispatch(
            new ProjectAction({
                actionType: Field(ProjectActionEnum.CREATE_PROJECT),
                projectId: Field(-1),
                members: members,
                ipfsHash: ipfsHash,
                treasuryAddress: treasuryAddress,
            })
        );
    }

    @method updateProject(
        projectId: Field,
        ipfsHash: IpfsHash,
        memberWitnessLevel1: ProjectMemberLevel1Witness,
        memberWitnessLevel2: ProjectMemberLevel2Witness
    ) {
        this.isOwner(
            projectId,
            memberWitnessLevel1,
            memberWitnessLevel2
        ).assertTrue();
        this.reducer.dispatch(
            new ProjectAction({
                actionType: Field(ProjectActionEnum.UPDATE_PROJECT),
                projectId: projectId,
                ipfsHash: ipfsHash,
                members: MemberArray.empty(), // no matter
                treasuryAddress: PublicKey.empty(), // no matter
            })
        );
    }

    @method rollup(rollupProjectProof: RollupProjectProof) {
        const nextProjectId = this.nextProjectId.getAndRequireEquals();
        const memberRoot = this.memberRoot.getAndRequireEquals();
        const ipfsHashRoot = this.ipfsHashRoot.getAndRequireEquals();
        const treasuryAddressRoot =
            this.treasuryAddressRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        nextProjectId.assertEquals(
            rollupProjectProof.publicOutput.initialProjectId
        );
        memberRoot.assertEquals(
            rollupProjectProof.publicOutput.initialMemberRoot
        );
        ipfsHashRoot.assertEquals(
            rollupProjectProof.publicOutput.initialIpfsHashRoot
        );
        treasuryAddressRoot.assertEquals(
            rollupProjectProof.publicOutput.initialTreasuryAddressRoot
        );
        actionState.assertEquals(
            rollupProjectProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(rollupProjectProof.publicOutput.nextActionState);
        this.nextProjectId.set(rollupProjectProof.publicOutput.nextProjectId);
        this.memberRoot.set(rollupProjectProof.publicOutput.nextMemberRoot);
        this.ipfsHashRoot.set(rollupProjectProof.publicOutput.nextIpfsHashRoot);
        this.treasuryAddressRoot.set(
            rollupProjectProof.publicOutput.nextTreasuryAddressRoot
        );
        this.actionState.set(rollupProjectProof.publicOutput.nextActionState);
    }

    isOwner(
        projectId: Field,
        memberWitnessLevel1: ProjectMemberLevel1Witness,
        memberWitnessLevel2: ProjectMemberLevel2Witness
    ): Bool {
        return this.nextProjectId
            .getAndRequireEquals()
            .greaterThan(projectId)
            .and(memberWitnessLevel1.calculateIndex().equals(projectId))
            .and(
                memberWitnessLevel1
                    .calculateRoot(
                        memberWitnessLevel2.calculateRoot(
                            ProjectMemberStorage.calculateLeaf(this.sender)
                        )
                    )
                    .equals(this.memberRoot.getAndRequireEquals())
            )
            .and(memberWitnessLevel2.calculateIndex().equals(Field(0)));
    }

    isValidTreasuryAddress(
        projectId: Field,
        treasuryAddress: PublicKey,
        treasuryAddressWitness: TreasuryAddressLevel1Witness
    ): Bool {
        return treasuryAddressWitness
            .calculateIndex()
            .equals(projectId)
            .and(
                treasuryAddressWitness
                    .calculateRoot(
                        TreasuryAddressStorage.calculateLeaf(treasuryAddress)
                    )
                    .equals(this.treasuryAddressRoot.getAndRequireEquals())
            );
    }
}

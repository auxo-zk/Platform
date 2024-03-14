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
    UInt64,
    Undefined,
} from 'o1js';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { updateActionState } from '../libs/utils.js';
import {
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_1_COMBINED_TREE,
    Level1Witness,
    Level1CWitness,
    ProjectIndexStorage,
    ProjectCounterStorage,
    DefaultLevel1Root,
    DefaultLevel1CombinedRoot,
    IpfsHashStorage,
} from './ParticipationStorage.js';
import {
    DefaultRootForZkAppTree,
    ZkAppAddressStorage,
    ZkAppRef,
} from './SharedStorage.js';
import { INSTANCE_LIMITS, ZkAppEnum } from '../Constants.js';
import { CampaignContract } from './Campaign-clone.js';
import {
    Level1Witness as TimelineLevel1Witness,
    CampaignTimelineStateEnum,
    Timeline,
} from './CampaignStorage.js';
import { ProjectContract } from './Project-clone.js';
import {
    Level1Witness as MemberLevel1Witness,
    Level2Witness as MemberLevel2Witness,
} from './ProjectStorage.js';

export class ParticipationAction extends Struct({
    campaignId: Field,
    projectId: Field,
    ipfsHash: IpfsHash,
    timestamp: UInt64,
}) {
    static fromFields(fields: Field[]): ParticipationAction {
        return super.fromFields(fields) as ParticipationAction;
    }

    getUniqueId() {
        return Poseidon.hash(
            this.campaignId.toFields().concat(this.projectId.toFields())
        );
    }
}

export class RollupParticipationOutput extends Struct({
    initialProjectIndexRoot: Field,
    initialProjectCounterRoot: Field,
    initialIpfsHashRoot: Field,
    initialActionState: Field,
    nextProjectIndexRoot: Field,
    nextProjectCounterRoot: Field,
    nextIpfsHashRoot: Field,
    nextActionState: Field,
}) {}

export const RollupParticipation = ZkProgram({
    name: 'RollupParticipation',
    publicOutput: RollupParticipationOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field],
            method(
                initialProjectIndexRoot: Field,
                initialProjectCounterRoot: Field,
                initialIpfsHashRoot: Field,
                initialActionState: Field
            ): RollupParticipationOutput {
                return new RollupParticipationOutput({
                    initialProjectIndexRoot: initialProjectIndexRoot,
                    initialProjectCounterRoot: initialProjectCounterRoot,
                    initialIpfsHashRoot: initialIpfsHashRoot,
                    initialActionState: initialActionState,
                    nextProjectIndexRoot: initialProjectCounterRoot,
                    nextProjectCounterRoot: initialIpfsHashRoot,
                    nextIpfsHashRoot: initialIpfsHashRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<Void, RollupParticipationOutput>,
                ParticipationAction,
                Field,
                Level1CWitness,
                Level1Witness,
                Level1CWitness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupParticipationOutput>,
                participationAction: ParticipationAction,
                projectCounter: Field,
                projectIndexWitness: Level1CWitness,
                projectCounterWitness: Level1Witness,
                ipfsHashWitness: Level1CWitness
            ) {
                earlierProof.verify();
                const campaignId = participationAction.campaignId;
                const projectId = participationAction.projectId;
                // Check project index
                projectIndexWitness.calculateIndex().assertEquals(
                    ProjectIndexStorage.calculateLevel1Index({
                        campaignId,
                        projectId,
                    })
                );
                projectIndexWitness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextProjectIndexRoot
                    );

                // Check project counter
                projectCounterWitness.calculateIndex().assertEquals(campaignId);
                projectCounterWitness
                    .calculateRoot(projectCounter)
                    .assertEquals(
                        earlierProof.publicOutput.nextProjectCounterRoot
                    );
                // Check ipfs hash
                ipfsHashWitness.calculateIndex().assertEquals(
                    IpfsHashStorage.calculateLevel1Index({
                        campaignId,
                        projectId,
                    })
                );
                ipfsHashWitness
                    .calculateRoot(Field(0))
                    .assertEquals(earlierProof.publicOutput.nextIpfsHashRoot);

                const currentIndex = projectCounter.add(1);
                const nextProjectIndexRoot =
                    projectIndexWitness.calculateRoot(currentIndex);
                const nextProjectCounterRoot =
                    projectCounterWitness.calculateRoot(currentIndex);
                const nextIpfsHashRoot = ipfsHashWitness.calculateRoot(
                    IpfsHashStorage.calculateLeaf(participationAction.ipfsHash)
                );
                return new RollupParticipationOutput({
                    initialProjectIndexRoot:
                        earlierProof.publicOutput.initialProjectIndexRoot,
                    initialProjectCounterRoot:
                        earlierProof.publicOutput.initialProjectCounterRoot,
                    initialIpfsHashRoot:
                        earlierProof.publicOutput.initialIpfsHashRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextProjectIndexRoot: nextProjectIndexRoot,
                    nextProjectCounterRoot: nextProjectCounterRoot,
                    nextIpfsHashRoot: nextIpfsHashRoot,
                    nextActionState: updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [ParticipationAction.toFields(participationAction)]
                    ),
                });
            },
        },
    },
});

export class RollupParticipationProof extends ZkProgram.Proof(
    RollupParticipation
) {}

export class ParticipationContract extends SmartContract {
    @state(Field) projectIndexRoot = State<Field>();
    @state(Field) projectCounterRoot = State<Field>();
    @state(Field) ipfsHashRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: ParticipationAction });

    init() {
        this.projectIndexRoot.set(DefaultLevel1CombinedRoot);
        this.projectCounterRoot.set(DefaultLevel1Root);
        this.ipfsHashRoot.set(DefaultLevel1CombinedRoot);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method participateCampaign(
        campaignId: Field,
        projectId: Field,
        ipfsHash: IpfsHash,
        campaignContractRef: ZkAppRef,
        projectContractRef: ZkAppRef,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        memberLevel1Witness: MemberLevel1Witness,
        memberLevel2Witness: MemberLevel2Witness,
        projectIndexWitness: Level1CWitness,
        projectCounter: Field,
        projectCounterWitness: Level1Witness
    ) {
        const participationAction = new ParticipationAction({
            campaignId: campaignId,
            projectId: projectId,
            ipfsHash: ipfsHash,
            timestamp: this.network.timestamp.getAndRequireEquals(),
        });
        // Check that not exist campaignId-projectId in reducer queue
        const actionState = this.actionState.getAndRequireEquals();
        const { state: existed } = this.reducer.reduce(
            this.reducer.getActions({
                fromActionState: actionState,
            }),
            Bool,
            (state: Bool, action: ParticipationAction) => {
                return action
                    .getUniqueId()
                    .equals(participationAction.getUniqueId())
                    .or(state);
            },
            // initial state
            { state: Bool(false), actionState: actionState }
        );
        existed.assertFalse();
        // Check that project index not existed
        this.isExistedProjectIndex(
            campaignId,
            projectId,
            projectIndexWitness
        ).assertFalse();
        // Check that sum of participated project not exceed LIMIT of PARTICIPATION
        this.projectCounterRoot
            .getAndRequireEquals()
            .assertEquals(projectCounterWitness.calculateRoot(projectCounter));
        projectCounterWitness.calculateIndex().assertEquals(campaignId);
        const { state: additionalCounter } = this.reducer.reduce(
            this.reducer.getActions({
                fromActionState: actionState,
            }),
            Field,
            (state: Field, action: ParticipationAction) => {
                return Provable.if(
                    action.campaignId.equals(campaignId),
                    state.add(1),
                    state
                );
            },
            // initial state
            { state: Field(0), actionState: actionState }
        );
        projectCounter
            .add(additionalCounter)
            .assertLessThanOrEqual(
                Field(INSTANCE_LIMITS.PARTICIPATION_SLOT_TREE_SIZE)
            );

        // Check that Campaign contract reference is valid
        this.zkAppRoot
            .getAndRequireEquals()
            .assertEquals(
                campaignContractRef.witness.calculateRoot(
                    ZkAppAddressStorage.calculateLeaf(
                        campaignContractRef.address
                    )
                )
            );
        campaignContractRef.witness
            .calculateIndex()
            .assertEquals(ZkAppEnum.CAMPAIGN);
        // Check that Project contract reference is valid
        this.zkAppRoot
            .getAndRequireEquals()
            .assertEquals(
                projectContractRef.witness.calculateRoot(
                    ZkAppAddressStorage.calculateLeaf(
                        projectContractRef.address
                    )
                )
            );
        projectContractRef.witness
            .calculateIndex()
            .assertEquals(ZkAppEnum.PROJECT);
        // Check valid timeline
        const campaignContract = new CampaignContract(
            campaignContractRef.address
        );
        campaignContract
            .getCampaignTimelineState(campaignId, timeline, timelineWitness)
            .assertEquals(Field(CampaignTimelineStateEnum.PARTICIPATION));
        // Check valid owner
        const projectContract = new ProjectContract(projectContractRef.address);
        projectContract
            .isOwner(projectId, memberLevel1Witness, memberLevel2Witness)
            .assertTrue();
        // dispatch
        this.reducer.dispatch(participationAction);
    }

    @method rollup(rollupParticipationProof: RollupParticipationProof) {
        rollupParticipationProof.verify();
        const projectIndexRoot = this.projectIndexRoot.getAndRequireEquals();
        const projectCounterRoot =
            this.projectCounterRoot.getAndRequireEquals();
        const ipfsHashRoot = this.ipfsHashRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        projectIndexRoot.assertEquals(
            rollupParticipationProof.publicOutput.initialProjectIndexRoot
        );
        projectCounterRoot.assertEquals(
            rollupParticipationProof.publicOutput.initialProjectCounterRoot
        );
        ipfsHashRoot.assertEquals(
            rollupParticipationProof.publicOutput.initialIpfsHashRoot
        );
        actionState.assertEquals(
            rollupParticipationProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(
                rollupParticipationProof.publicOutput.nextActionState
            );
        this.projectIndexRoot.set(
            rollupParticipationProof.publicOutput.nextProjectIndexRoot
        );
        this.projectCounterRoot.set(
            rollupParticipationProof.publicOutput.nextProjectCounterRoot
        );
        this.ipfsHashRoot.set(
            rollupParticipationProof.publicOutput.nextIpfsHashRoot
        );
        this.actionState.set(
            rollupParticipationProof.publicOutput.nextActionState
        );
    }

    isExistedProjectIndex(
        campaignId: Field,
        projectId: Field,
        projectIndexWitness: Level1CWitness
    ): Bool {
        projectIndexWitness.calculateIndex().assertEquals(
            ProjectIndexStorage.calculateLevel1Index({
                campaignId,
                projectId,
            })
        );
        const projectIndexRoot = this.projectIndexRoot.getAndRequireEquals();
        return Provable.if(
            projectIndexRoot.equals(
                projectIndexWitness.calculateRoot(Field(0))
            ),
            Bool(false),
            Bool(true)
        );
    }

    isValidProjectIndex(
        campaignId: Field,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: Level1CWitness
    ) {
        projectIndexWitness.calculateIndex().assertEquals(
            ProjectIndexStorage.calculateLevel1Index({
                campaignId,
                projectId,
            })
        );
        const projectIndexRoot = this.projectIndexRoot.getAndRequireEquals();
        return Provable.if(
            projectIndexRoot.equals(
                projectIndexWitness.calculateRoot(projectIndex)
            ),
            Bool(true),
            Bool(false)
        );
    }

    isValidProjectCounter(
        campaignId: Field,
        projectCounter: Field,
        projectCounterWitness: Level1Witness
    ): Bool {
        projectCounterWitness.calculateIndex().assertEquals(campaignId);
        const projectCounterRoot =
            this.projectCounterRoot.getAndRequireEquals();
        return Provable.if(
            projectCounterRoot.equals(
                projectCounterWitness.calculateRoot(projectCounter)
            ),
            Bool(true),
            Bool(false)
        );
    }

    hasValidActionStateForFunding(timeline: Timeline): Bool {
        const actionState = this.actionState.getAndRequireEquals();
        const actions = this.reducer.getActions({
            fromActionState: actionState,
        });
        return this.reducer.reduce(
            actions.slice(0, 1),
            Bool,
            (state: Bool, action: ParticipationAction) => {
                return state.and(
                    action.timestamp.greaterThan(timeline.startFunding)
                );
            },
            {
                state: Bool(true),
                actionState: actionState,
            }
        ).state;
    }
}

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
import { IpfsHash } from '@auxo-dev/auxo-libs';
import {
    Level1Witness,
    DefaultLevel1Root,
    Timeline,
    CampaignTimelineStateEnum,
    CampaignActionEnum,
    IpfsHashStorage,
    KeyStorage,
    TimelineStorage,
} from './CampaignStorage.js';
import { updateActionState } from '../libs/utils.js';
import { ZkAppRef } from './SharedStorage.js';
import { DkgContract } from '@auxo-dev/dkg';

export class CampaignAction extends Struct({
    campaignId: Field,
    ipfsHash: IpfsHash,
    owner: PublicKey,
    timeline: Timeline,
    committeeId: Field,
    keyId: Field,
}) {
    static fromFields(fields: Field[]): CampaignAction {
        return super.fromFields(fields) as CampaignAction;
    }
}

export class RollupCampaignOutput extends Struct({
    initialCampaignId: Field,
    initialTimelineRoot: Field,
    initialIpfsHashRoot: Field,
    initialKeyRoot: Field,
    initialActionState: Field,

    nextCampaignId: Field,
    nextTimelineRoot: Field,
    nextIpfsHashRoot: Field,
    nextKeyRoot: Field,
    nextActionState: Field,
}) {}

export const RollupCampaign = ZkProgram({
    name: 'RollupCampaign',
    publicOutput: RollupCampaignOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field, Field],
            method(
                initialCampaignId: Field,
                initialTimelineRoot: Field,
                initialIpfsHashRoot: Field,
                initialKeyRoot: Field,
                initialActionState: Field
            ): RollupCampaignOutput {
                return new RollupCampaignOutput({
                    initialCampaignId,
                    initialTimelineRoot,
                    initialIpfsHashRoot,
                    initialKeyRoot,
                    initialActionState,
                    nextCampaignId: initialCampaignId,
                    nextTimelineRoot: initialTimelineRoot,
                    nextIpfsHashRoot: initialIpfsHashRoot,
                    nextKeyRoot: initialKeyRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        nextStep: {
            privateInputs: [
                SelfProof<Void, RollupCampaignOutput>,
                CampaignAction,
                Level1Witness,
                Level1Witness,
                Level1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupCampaignOutput>,
                campaignAction: CampaignAction,
                timelineWitness: Level1Witness,
                ipfsHashWitness: Level1Witness,
                keyWitness: Level1Witness
            ) {
                earlierProof.verify();
                // Verify empty timeline
                const previousTimelineRoot = timelineWitness.calculateRoot(
                    Field(0)
                );
                const timelineIndex = timelineWitness.calculateIndex();
                previousTimelineRoot.assertEquals(
                    earlierProof.publicOutput.nextTimelineRoot
                );
                timelineIndex.assertEquals(
                    earlierProof.publicOutput.nextCampaignId
                );

                // Verify empty ipfs hash
                const previousIpfsHashRoot = ipfsHashWitness.calculateRoot(
                    Field(0)
                );
                const ipfsHashIndex = ipfsHashWitness.calculateIndex();
                previousIpfsHashRoot.assertEquals(
                    earlierProof.publicOutput.nextIpfsHashRoot
                );
                ipfsHashIndex.assertEquals(
                    earlierProof.publicOutput.nextCampaignId
                );

                // Verify empty key
                const previousKeyRoot = keyWitness.calculateRoot(Field(0));
                const keyIndex = keyWitness.calculateIndex();
                previousKeyRoot.assertEquals(
                    earlierProof.publicOutput.nextKeyRoot
                );
                keyIndex.assertEquals(earlierProof.publicOutput.nextCampaignId);

                const nextTimelineRoot = timelineWitness.calculateRoot(
                    TimelineStorage.calculateLeaf(campaignAction.timeline)
                );
                const nextIpfsHashRoot = ipfsHashWitness.calculateRoot(
                    IpfsHashStorage.calculateLeaf(campaignAction.ipfsHash)
                );
                const nextKeyRoot = keyWitness.calculateRoot(
                    KeyStorage.calculateLeaf({
                        committeeId: campaignAction.campaignId,
                        keyId: campaignAction.keyId,
                    })
                );

                return new RollupCampaignOutput({
                    initialCampaignId:
                        earlierProof.publicOutput.initialCampaignId,
                    initialTimelineRoot:
                        earlierProof.publicOutput.initialTimelineRoot,
                    initialIpfsHashRoot:
                        earlierProof.publicOutput.initialIpfsHashRoot,
                    initialKeyRoot: earlierProof.publicOutput.initialKeyRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextCampaignId:
                        earlierProof.publicOutput.nextCampaignId.add(1),
                    nextTimelineRoot: nextTimelineRoot,
                    nextIpfsHashRoot: nextIpfsHashRoot,
                    nextKeyRoot: nextKeyRoot,
                    nextActionState: updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [CampaignAction.toFields(campaignAction)]
                    ),
                });
            },
        },
    },
});

export class RollupCampaignProof extends ZkProgram.Proof(RollupCampaign) {}

export class CampaignContract extends SmartContract {
    @state(Field) nextCampaignId = State<Field>();
    @state(Field) timelineRoot = State<Field>();
    @state(Field) ipfsHashRoot = State<Field>();
    @state(Field) keyRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) rollupRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: CampaignAction });

    init() {
        super.init();
        this.zkAppRoot.set(DefaultLevel1Root);
        this.ipfsHashRoot.set(DefaultLevel1Root);
        this.keyRoot.set(DefaultLevel1Root);
        this.timelineRoot.set(DefaultLevel1Root);
        this.rollupRoot.set(DefaultLevel1Root);
        this.actionState.set(Reducer.initialActionState);
    }

    @method createCampaign(
        timeline: Timeline,
        ipfsHash: IpfsHash,
        committeeId: Field,
        keyId: Field,
        dkgContractRef: ZkAppRef
    ) {
        timeline.isValid().assertEquals(Bool(true));
        timeline.startParticipation.assertGreaterThan(
            this.network.timestamp.getAndRequireEquals()
        );
        // Should check the valid of key right here
        // const dkgContract = new DKGContract(dkgContractRef.address);
        // dkgContract
        this.reducer.dispatch(
            new CampaignAction({
                campaignId: Field(-1),
                ipfsHash: ipfsHash,
                owner: this.sender,
                timeline: timeline,
                committeeId: committeeId,
                keyId: keyId,
            })
        );
    }

    @method rollup(rollupCampaignProof: RollupCampaignProof) {
        rollupCampaignProof.verify();
        const nextCampaignId = this.nextCampaignId.getAndRequireEquals();
        const timelineRoot = this.timelineRoot.getAndRequireEquals();
        const ipfsHashRoot = this.ipfsHashRoot.getAndRequireEquals();
        const keyRoot = this.keyRoot.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        nextCampaignId.assertEquals(
            rollupCampaignProof.publicOutput.initialCampaignId
        );
        timelineRoot.assertEquals(
            rollupCampaignProof.publicOutput.initialTimelineRoot
        );
        ipfsHashRoot.assertEquals(
            rollupCampaignProof.publicOutput.initialIpfsHashRoot
        );
        keyRoot.assertEquals(rollupCampaignProof.publicOutput.initialKeyRoot);
        actionState.assertEquals(
            rollupCampaignProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(rollupCampaignProof.publicOutput.nextActionState);

        this.nextCampaignId.set(
            rollupCampaignProof.publicOutput.nextCampaignId
        );
        this.timelineRoot.set(
            rollupCampaignProof.publicOutput.nextTimelineRoot
        );
        this.ipfsHashRoot.set(
            rollupCampaignProof.publicOutput.nextIpfsHashRoot
        );
        this.keyRoot.set(rollupCampaignProof.publicOutput.nextKeyRoot);
        this.actionState.set(rollupCampaignProof.publicOutput.nextActionState);
    }

    getCampaignTimelineState(
        campaignId: Field,
        timeline: Timeline,
        timelineWitness: Level1Witness
    ): Field {
        timeline.isValid().assertEquals(Bool(true));
        timelineWitness.calculateIndex().assertEquals(campaignId);
        const timelineRoot = this.timelineRoot.getAndRequireEquals();
        timelineRoot.assertEquals(
            timelineWitness.calculateRoot(timeline.hash())
        );
        const currentTimestamp = this.network.timestamp.getAndRequireEquals();
        const campaignState = Provable.if(
            currentTimestamp.lessThan(timeline.startParticipation),
            Field(CampaignTimelineStateEnum.PREPARATION),
            Provable.if(
                currentTimestamp.lessThan(timeline.startFunding),
                Field(CampaignTimelineStateEnum.PARTICIPATION),
                Provable.if(
                    currentTimestamp.lessThan(timeline.startRequest),
                    Field(CampaignTimelineStateEnum.FUNDING),
                    Provable.if(
                        currentTimestamp.lessThan(timeline.end),
                        Field(CampaignTimelineStateEnum.REQUESTING),
                        Field(CampaignTimelineStateEnum.ENDED)
                    )
                )
            )
        );
        return campaignState;
    }

    isValidKey(
        campaignId: Field,
        committeeId: Field,
        keyId: Field,
        keyWitness: Level1Witness
    ): Bool {
        return keyWitness
            .calculateIndex()
            .equals(KeyStorage.calculateLevel1Index(campaignId))
            .and(
                keyWitness
                    .calculateRoot(
                        KeyStorage.calculateLeaf({ committeeId, keyId })
                    )
                    .equals(this.keyRoot.getAndRequireEquals())
            );
    }
}

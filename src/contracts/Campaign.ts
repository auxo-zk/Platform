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
import {
    DefaultRootForCampaignTree,
    Timeline,
    CampaignTimelineStateEnum,
    IpfsHashStorage,
    KeyIndexStorage,
    TimelineStorage,
    TimelineLevel1Witness,
    IpfsHashLevel1Witness,
    KeyIndexLevel1Witness,
} from '../storages/CampaignStorage.js';
import {
    AddressWitness,
    DefaultRootForZkAppTree,
    verifyZkApp,
    ZkAppRef,
} from '../storages/SharedStorage.js';
import { ZkAppEnum } from '../Constants.js';
import {
    KeyStatus,
    KeyStatusInput,
    ZkApp as DkgZkApp,
    Storage,
} from '@auxo-dev/dkg';

export {
    CampaignAction,
    CampaignContract,
    CampaignContractMock,
    RollupCampaign,
    RollupCampaignOutput,
    RollupCampaignProof,
};

class CampaignAction extends Struct({
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

class RollupCampaignOutput extends Struct({
    initialCampaignId: Field,
    initialTimelineRoot: Field,
    initialIpfsHashRoot: Field,
    initialKeyIndexRoot: Field,
    initialActionState: Field,

    nextCampaignId: Field,
    nextTimelineRoot: Field,
    nextIpfsHashRoot: Field,
    nextKeyIndexRoot: Field,
    nextActionState: Field,
}) {}

const RollupCampaign = ZkProgram({
    name: 'RollupCampaign',
    publicOutput: RollupCampaignOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field, Field, Field],
            method(
                initialCampaignId: Field,
                initialTimelineRoot: Field,
                initialIpfsHashRoot: Field,
                initialKeyIndexRoot: Field,
                initialActionState: Field
            ): RollupCampaignOutput {
                return new RollupCampaignOutput({
                    initialCampaignId,
                    initialTimelineRoot,
                    initialIpfsHashRoot,
                    initialKeyIndexRoot,
                    initialActionState,
                    nextCampaignId: initialCampaignId,
                    nextTimelineRoot: initialTimelineRoot,
                    nextIpfsHashRoot: initialIpfsHashRoot,
                    nextKeyIndexRoot: initialKeyIndexRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        createCampaignStep: {
            privateInputs: [
                SelfProof<Void, RollupCampaignOutput>,
                CampaignAction,
                TimelineLevel1Witness,
                IpfsHashLevel1Witness,
                KeyIndexLevel1Witness,
            ],
            method(
                earlierProof: SelfProof<Void, RollupCampaignOutput>,
                campaignAction: CampaignAction,
                timelineWitness: TimelineLevel1Witness,
                ipfsHashWitness: IpfsHashLevel1Witness,
                keyIndexWitness: KeyIndexLevel1Witness
            ) {
                earlierProof.verify();
                // Verify empty timeline
                timelineWitness
                    .calculateRoot(Field(0))
                    .assertEquals(earlierProof.publicOutput.nextTimelineRoot);
                timelineWitness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextCampaignId);

                // Verify empty ipfs hash
                ipfsHashWitness
                    .calculateRoot(Field(0))
                    .assertEquals(earlierProof.publicOutput.nextIpfsHashRoot);
                ipfsHashWitness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextCampaignId);

                // Verify empty key
                keyIndexWitness
                    .calculateRoot(Field(0))
                    .assertEquals(earlierProof.publicOutput.nextKeyIndexRoot);
                keyIndexWitness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextCampaignId);

                const nextTimelineRoot = timelineWitness.calculateRoot(
                    TimelineStorage.calculateLeaf(campaignAction.timeline)
                );
                const nextIpfsHashRoot = ipfsHashWitness.calculateRoot(
                    IpfsHashStorage.calculateLeaf(campaignAction.ipfsHash)
                );
                const nextKeyIndexRoot = keyIndexWitness.calculateRoot(
                    KeyIndexStorage.calculateLeaf({
                        committeeId: campaignAction.committeeId,
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
                    initialKeyIndexRoot:
                        earlierProof.publicOutput.initialKeyIndexRoot,
                    initialActionState:
                        earlierProof.publicOutput.initialActionState,
                    nextCampaignId:
                        earlierProof.publicOutput.nextCampaignId.add(1),
                    nextTimelineRoot: nextTimelineRoot,
                    nextIpfsHashRoot: nextIpfsHashRoot,
                    nextKeyIndexRoot: nextKeyIndexRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [CampaignAction.toFields(campaignAction)]
                    ),
                });
            },
        },
    },
});

class RollupCampaignProof extends ZkProgram.Proof(RollupCampaign) {}

class CampaignContract extends SmartContract {
    @state(Field) nextCampaignId = State<Field>();
    @state(Field) timelineRoot = State<Field>();
    @state(Field) ipfsHashRoot = State<Field>();
    @state(Field) keyIndexRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: CampaignAction });

    init() {
        super.init();
        this.nextCampaignId.set(Field(0));
        this.timelineRoot.set(DefaultRootForCampaignTree);
        this.ipfsHashRoot.set(DefaultRootForCampaignTree);
        this.keyIndexRoot.set(DefaultRootForCampaignTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method createCampaign(
        timeline: Timeline,
        ipfsHash: IpfsHash,
        committeeId: Field,
        keyId: Field,
        keyStatusWitness: Storage.DKGStorage.DkgLevel1Witness,
        campaignContractWitness: AddressWitness,
        dkgContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef
    ) {
        const currentTimestamp = this.network.timestamp.getAndRequireEquals();
        timeline.isValid().assertEquals(Bool(true));
        timeline.startParticipation.assertGreaterThan(currentTimestamp);

        // Verify the status of key is active
        verifyZkApp(
            CampaignContract.name,
            dkgContractRef,
            this.zkAppRoot.getAndRequireEquals(),
            Field(ZkAppEnum.DKG)
        );
        const dkgContract = new DkgZkApp.DKG.DkgContract(
            dkgContractRef.address
        );
        dkgContract.verifyKeyStatus(
            new KeyStatusInput({
                committeeId: committeeId,
                keyId: keyId,
                status: Field(KeyStatus.ACTIVE),
                witness: keyStatusWitness,
            })
        );

        // Create task in requester contract
        verifyZkApp(
            CampaignContract.name,
            requesterContractRef,
            this.zkAppRoot.getAndRequireEquals(),
            Field(ZkAppEnum.REQUESTER)
        );
        const requesterContract = new DkgZkApp.Requester.RequesterContract(
            requesterContractRef.address
        );
        requesterContract.createTask(
            Storage.DKGStorage.calculateKeyIndex(committeeId, keyId),
            timeline.startRequesting,
            new ZkAppRef({
                address: this.address,
                witness: campaignContractWitness,
            })
        );

        // Dispatch action
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
        const keyIndexRoot = this.keyIndexRoot.getAndRequireEquals();
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
        keyIndexRoot.assertEquals(
            rollupCampaignProof.publicOutput.initialKeyIndexRoot
        );
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
        this.keyIndexRoot.set(
            rollupCampaignProof.publicOutput.nextKeyIndexRoot
        );
        this.actionState.set(rollupCampaignProof.publicOutput.nextActionState);
    }

    getCampaignTimelineState(
        campaignId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness
    ): Field {
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
                    currentTimestamp.lessThan(timeline.startRequesting),
                    Field(CampaignTimelineStateEnum.FUNDING),
                    Field(CampaignTimelineStateEnum.REQUESTING)
                )
            )
        );
        return campaignState;
    }

    isValidKey(
        campaignId: Field,
        committeeId: Field,
        keyId: Field,
        keyWitness: TimelineLevel1Witness
    ): Bool {
        return keyWitness
            .calculateIndex()
            .equals(KeyIndexStorage.calculateLevel1Index(campaignId))
            .and(
                keyWitness
                    .calculateRoot(
                        KeyIndexStorage.calculateLeaf({ committeeId, keyId })
                    )
                    .equals(this.keyIndexRoot.getAndRequireEquals())
            );
    }
}
class CampaignContractMock extends SmartContract {
    @state(Field) nextCampaignId = State<Field>();
    @state(Field) timelineRoot = State<Field>();
    @state(Field) ipfsHashRoot = State<Field>();
    @state(Field) keyIndexRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: CampaignAction });

    init() {
        super.init();
        this.nextCampaignId.set(Field(0));
        this.timelineRoot.set(DefaultRootForCampaignTree);
        this.ipfsHashRoot.set(DefaultRootForCampaignTree);
        this.keyIndexRoot.set(DefaultRootForCampaignTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method createCampaign(
        timeline: Timeline,
        ipfsHash: IpfsHash,
        committeeId: Field,
        keyId: Field,
        // keyStatusWitness: Storage.DKGStorage.DkgLevel1Witness,
        campaignContractWitness: AddressWitness,
        dkgContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef
    ) {
        const currentTimestamp = this.network.timestamp.getAndRequireEquals();
        timeline.isValid().assertEquals(Bool(true));
        timeline.startParticipation.assertGreaterThan(currentTimestamp);

        // Verify the status of key is active
        verifyZkApp(
            CampaignContract.name,
            dkgContractRef,
            this.zkAppRoot.getAndRequireEquals(),
            Field(ZkAppEnum.DKG)
        );
        // const dkgContract = new DkgZkApp.DKG.DkgContract(
        //     dkgContractRef.address
        // );
        // dkgContract.verifyKeyStatus(
        //     new KeyStatusInput({
        //         committeeId: committeeId,
        //         keyId: keyId,
        //         status: Field(KeyStatus.ACTIVE),
        //         witness: keyStatusWitness,
        //     })
        // );

        // Create task in requester contract
        verifyZkApp(
            CampaignContract.name,
            requesterContractRef,
            this.zkAppRoot.getAndRequireEquals(),
            Field(ZkAppEnum.REQUESTER)
        );
        // const requesterContract = new DkgZkApp.Requester.RequesterContract(
        //     requesterContractRef.address
        // );
        // requesterContract.createTask(
        //     Storage.DKGStorage.calculateKeyIndex(committeeId, keyId),
        //     timeline.startRequesting,
        //     new ZkAppRef({
        //         address: this.address,
        //         witness: campaignContractWitness,
        //     })
        // );

        // Dispatch action
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
        const keyIndexRoot = this.keyIndexRoot.getAndRequireEquals();
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
        keyIndexRoot.assertEquals(
            rollupCampaignProof.publicOutput.initialKeyIndexRoot
        );
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
        this.keyIndexRoot.set(
            rollupCampaignProof.publicOutput.nextKeyIndexRoot
        );
        this.actionState.set(rollupCampaignProof.publicOutput.nextActionState);
    }

    getCampaignTimelineState(
        campaignId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness
    ): Field {
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
                    currentTimestamp.lessThan(timeline.startRequesting),
                    Field(CampaignTimelineStateEnum.FUNDING),
                    Field(CampaignTimelineStateEnum.REQUESTING)
                )
            )
        );
        return campaignState;
    }

    isValidKey(
        campaignId: Field,
        committeeId: Field,
        keyId: Field,
        keyWitness: TimelineLevel1Witness
    ): Bool {
        return keyWitness
            .calculateIndex()
            .equals(KeyIndexStorage.calculateLevel1Index(campaignId))
            .and(
                keyWitness
                    .calculateRoot(
                        KeyIndexStorage.calculateLeaf({ committeeId, keyId })
                    )
                    .equals(this.keyIndexRoot.getAndRequireEquals())
            );
    }
}

import {
    Field,
    Bool,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
    UInt64,
    Provable,
} from 'o1js';
import { INSTANCE_LIMITS } from '../Constants.js';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { Constants as DkgConstants } from '@auxo-dev/dkg';

export const LEVEL_1_CAMPAIGN_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN_TREE_SIZE)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(
    LEVEL_1_CAMPAIGN_TREE_HEIGHT
) {}

export const EMPTY_LEVEL_1_CAMPAIGN_TREE = () =>
    new Level1MT(LEVEL_1_CAMPAIGN_TREE_HEIGHT);

export const DefaultRootForCampaignTree =
    EMPTY_LEVEL_1_CAMPAIGN_TREE().getRoot();
// Storage
export abstract class CampaignStorage<RawLeaf> {
    private _level1: Level1MT;
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RawLeaf | Field;
        }[]
    ) {
        this._level1 = EMPTY_LEVEL_1_CAMPAIGN_TREE();
        this._leafs = {};
        if (leafs) {
            for (let i = 0; i < leafs.length; i++) {
                if (leafs[i].leaf instanceof Field) {
                    this.updateLeaf(
                        leafs[i].level1Index,
                        leafs[i].leaf as Field
                    );
                } else {
                    this.updateRawLeaf(
                        leafs[i].level1Index,
                        leafs[i].leaf as RawLeaf
                    );
                }
            }
        }
    }

    get root(): Field {
        return this._level1.getRoot();
    }

    get level1(): Level1MT {
        return this._level1;
    }

    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } } {
        return this._leafs;
    }

    abstract calculateLeaf(rawLeaf: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1Witness {
        return new Level1Witness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getWitness(level1Index: Field): Level1Witness {
        return this.getLevel1Witness(level1Index);
    }

    updateLeaf(level1Index: Field, leaf: Field): void {
        this._level1.setLeaf(level1Index.toBigInt(), leaf);
        this._leafs[level1Index.toString()] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateRawLeaf(level1Index: Field, rawLeaf: RawLeaf): void {
        let leaf = this.calculateLeaf(rawLeaf);
        this._level1.setLeaf(level1Index.toBigInt(), leaf);
        this._leafs[level1Index.toString()] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}

export type IpfsHashLeaf = IpfsHash;

export class IpfsHashStorage extends CampaignStorage<IpfsHashLeaf> {
    static calculateLeaf(ipfsHash: IpfsHashLeaf): Field {
        return Poseidon.hash(ipfsHash.toFields());
    }

    calculateLeaf(ipfsHash: IpfsHashLeaf): Field {
        return IpfsHashStorage.calculateLeaf(ipfsHash);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return IpfsHashStorage.calculateLevel1Index(campaignId);
    }
}

export type OwnerLeaf = PublicKey;

export class OwnerStorage extends CampaignStorage<OwnerLeaf> {
    static calculateLeaf(publicKey: OwnerLeaf): Field {
        return Poseidon.hash(publicKey.toFields());
    }

    calculateLeaf(publicKey: OwnerLeaf): Field {
        return OwnerStorage.calculateLeaf(publicKey);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return OwnerStorage.calculateLevel1Index(campaignId);
    }
}

export type KeyLeaf = {
    committeeId: Field;
    keyId: Field;
};

export class KeyStorage extends CampaignStorage<KeyLeaf> {
    static calculateLeaf(rawLeaf: KeyLeaf): Field {
        return Poseidon.hash([rawLeaf.committeeId, rawLeaf.keyId]);
    }

    calculateLeaf(rawLeaf: KeyLeaf): Field {
        return KeyStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return KeyStorage.calculateLevel1Index(campaignId);
    }
}

export enum CampaignTimelineStateEnum {
    PREPARATION,
    PARTICIPATION,
    FUNDING,
    REQUESTING,
    ENDED,
}

export enum CampaignStateEnum {
    NOT_CREATED,
    CREATED,
    COMPLETED,
    ABORTED,
}

export enum CampaignActionEnum {
    CREATE_CAMPAIGN,
    END_CAMPAIGN,
}

export class Timeline extends Struct({
    start: UInt64,
    startParticipation: UInt64,
    startFunding: UInt64,
    startRequest: UInt64,
    end: UInt64,
}) {
    isValid(): Bool {
        return Provable.if(
            this.start
                .lessThan(this.startParticipation)
                .and(this.startParticipation.lessThan(this.startFunding))
                .and(this.startFunding.lessThan(this.startRequest))
                .and(this.startRequest.lessThan(this.end))
                .and(
                    this.end
                        .sub(this.startRequest)
                        .greaterThanOrEqual(
                            new UInt64(DkgConstants.REQUEST_MIN_PERIOD)
                        )
                ),
            Bool(true),
            Bool(false)
        );
    }

    hash(): Field {
        return Poseidon.hash(Timeline.toFields(this));
    }
}

export type TimelineLeaf = Timeline;

export class TimelineStorage extends CampaignStorage<TimelineLeaf> {
    static calculateLeaf(timeline: TimelineLeaf): Field {
        return timeline.hash();
    }

    calculateLeaf(timeline: TimelineLeaf): Field {
        return TimelineStorage.calculateLeaf(timeline);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return TimelineStorage.calculateLevel1Index(campaignId);
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Event } from './schemas/event.schema';
import { EVENT_STORE_CONNECTION } from '../../../core/core.constants';
import { SerializableEvent } from '../../domain/interfaces/serializable-event';
import { Model } from 'mongoose';

@Injectable()
export class MongoEventStore {
  private readonly logger = new Logger(MongoEventStore.name);

  constructor(
    @InjectModel(Event.name, EVENT_STORE_CONNECTION)
    private readonly eventStore: Model<Event>,
  ) {}

  async persist(
    eventOrEvents: SerializableEvent | SerializableEvent[],
  ): Promise<void> {
    const events = Array.isArray(eventOrEvents)
      ? eventOrEvents
      : [eventOrEvents];
    const session = await this.eventStore.startSession();
    try {
      session.startTransaction();
      await this.eventStore.insertMany(events, { session, ordered: true });
      await session.commitTransaction();
      this.logger.debug(`Events inserted successfully to the event store`);
    } catch (error) {
      await session.abortTransaction();
      const UNIQUE_CONSTRAINT_ERROR_CODE = 11000;
      if (error?.code === UNIQUE_CONSTRAINT_ERROR_CODE) {
        this.logger.error(`Events could not be persisted. Aggregate is stale.`);
        console.error(error.writeErrors?.[0]?.err?.errmsg);
      } else {
        throw error;
      }
    } finally {
      await session.endSession();
    }
  }
}

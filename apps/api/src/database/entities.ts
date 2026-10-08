import { Conversation } from '../conversations/conversation.entity.js';
import { Message } from '../conversations/message.entity.js';
import { RunEventRecord } from '../conversations/run-event.entity.js';
import { Run } from '../conversations/run.entity.js';
import { UserSettings } from '../users/user-settings.entity.js';
import { User } from '../users/user.entity.js';

export const ENTITIES = [User, UserSettings, Conversation, Message, Run, RunEventRecord];

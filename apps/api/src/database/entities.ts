import { AccountToken } from '../auth/account-token.entity.js';
import { Conversation } from '../conversations/conversation.entity.js';
import { Message } from '../conversations/message.entity.js';
import { RunEventRecord } from '../conversations/run-event.entity.js';
import { Run } from '../conversations/run.entity.js';
import { ModelCall } from '../model/usage/model-call.entity.js';
import { UsageDaily } from '../model/usage/usage-daily.entity.js';
import { Project } from '../projects/project.entity.js';
import { UserSettings } from '../users/user-settings.entity.js';
import { User } from '../users/user.entity.js';

export const ENTITIES = [
  User,
  UserSettings,
  Project,
  Conversation,
  Message,
  Run,
  RunEventRecord,
  UsageDaily,
  ModelCall,
  AccountToken,
];

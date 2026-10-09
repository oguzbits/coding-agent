export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Where mails go out. The default implementation only logs; a real provider replaces it without touching the flows. */
export abstract class MailSender {
  abstract send(mail: Mail): Promise<void>;
}

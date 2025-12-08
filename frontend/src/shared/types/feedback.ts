export type FeedbackTone = "info" | "success" | "warning" | "danger";

export interface FeedbackMessage {
    message: string;
    tone: FeedbackTone;
}

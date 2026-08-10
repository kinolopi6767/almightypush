export interface TemplatePayload {
  id: number;
  name: string;
  title: string | null;
  message: string | null;
  icon_url: string | null;
  image_url: string | null;
  launch_url: string | null;
  buttons_json: string | null;
}
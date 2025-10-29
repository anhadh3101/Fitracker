import {
	WorkflowEntrypoint,
	WorkflowEvent,
	WorkflowStep,
} from "cloudflare:workers";

/**
 * Welcome to Cloudflare Workers! This is your first Workflows application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Workflow in action
 * - Run `npm run deploy` to publish your application
 *
 * Learn more at https://developers.cloudflare.com/workflows
 */
 
// User-defined params passed to your Workflow
type Params = {
	email: string;
	metadata: Record<string, string>;
	query: string;
};

type LLMResponse = {
	inputs: {
	  messages: { role: string; content: string }[];
	};
	response: {
	  response: string;
	  usage?: Record<string, number>;
	};
  }[];

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		// Can access bindings on `this.env`
		// Can access params on `event.payload`

		const { query } = event.payload;

		const chatResponse = await step.do<LLMResponse>("Get model response", async () => {
			const resp = await fetch("https://aifit-worker-ai.anhadhsran3101.workers.dev/", {
			  method: "POST",
			  headers: { "Content-Type": "application/json" },
			  body: JSON.stringify({ query, type: "chat" }),
			});
			if (!resp.ok) throw new Error(`Request failed: ${resp.status} ${resp.statusText}`);
			return await resp.json();               // must be structured-cloneable
		  });
	  
		const reply = chatResponse?.[0]?.response?.response ?? "";


		const userId = await step.do("Find user ID", async () => {
			const { email } = event.payload;
			const API_URL = `https://aifit-db-2.anhadhsran3101.workers.dev/api/getUser?email=${email}`;
	
			const res = await fetch(API_URL, {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
			const users = await res.json();
			
			// getUser returns an array, extract the first user's ID
			if (Array.isArray(users) && users.length > 0) {
				return users[0].id;
			}
			
			throw new Error("User not found");
		});

	// Get existing content and append AI response
	const existingNotes = await step.do("Get existing notes", async () => {
		const res = await fetch(`https://aifit-db-2.anhadhsran3101.workers.dev/api/getNotes?user_id=${userId}`);
		if (!res.ok) return "";
		const notes = await res.json();
		return (Array.isArray(notes) && notes.length > 0) ? notes[0].content : "";
	});

	const updatedContent = existingNotes ? `${existingNotes}\n\n---\n\nAI: ${reply}` : `AI: ${reply}`;

	const saveResponse = await step.do<{ ok: boolean; id: string; changes: number }>("Save notes", async () => {
		const res = await fetch("https://aifit-db-2.anhadhsran3101.workers.dev/api/saveNotes", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ user_id: userId, content: updatedContent })
		});
		if (!res.ok) throw new Error(`Failed: ${res.status}`);
		return await res.json();
	});
		

		// You can optionally have a Workflow wait for additional data,
		// human approval or an external webhook or HTTP request, before progressing.
		// You can submit data via HTTP POST to /accounts/{account_id}/workflows/{workflow_name}/instances/{instance_id}/events/{eventName}
		// const waitForApproval = await step.waitForEvent("request-approval", {
		// 	type: "approval", // define an optional key to switch on
		// 	timeout: "1 minute", // keep it short for the example!
		// });
	}
}
export default {
	async fetch(req: Request, env: Env): Promise<Response> {
	  const url = new URL(req.url);
  
	  // --- ✅ CORS headers
	  const corsHeaders = {
		"Access-Control-Allow-Origin": "*", // or restrict to your Pages site
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
	  };
  
	  // --- ✅ Handle preflight requests
	  if (req.method === "OPTIONS") {
		return new Response(null, { headers: corsHeaders });
	  }
  
	  // --- favicon check
	  if (url.pathname.startsWith("/favicon")) {
		return new Response(null, { status: 404, headers: corsHeaders });
	  }
  
	  // --- ✅ Workflow instance status check
	  if (url.searchParams.has("instanceId")) {
		const id = url.searchParams.get("instanceId")!;
		const instance = await env.MY_WORKFLOW.get(id);
		return new Response(JSON.stringify({
		  status: await instance.status(),
		}), { headers: { "Content-Type": "application/json", ...corsHeaders } });
	  }
  
	  // --- ✅ Parse payload for POST
	  let payload: Params | null = null;
	  if (req.method === "POST") {
		payload = await req.json();
	  } else {
		// You can choose to reject other methods
		return new Response("Only POST supported", {
		  status: 405,
		  headers: corsHeaders,
		});
	  }
  
	  // --- ✅ Create a new workflow instance
	  const instance = await env.MY_WORKFLOW.create({
		params: payload || { email: "", metadata: {}, query: "" },
	  });
  
	  return new Response(JSON.stringify({
		id: instance.id,
		details: await instance.status(),
	  }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
	},
  };
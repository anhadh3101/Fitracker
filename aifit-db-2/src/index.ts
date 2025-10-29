/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
		// If you set another name in the Wrangler config file for the value for 'binding',
		// replace "DB" with the variable name you defined.
		aifit_db_2: D1Database;
	}

  // Simple SHA-256 hash function
	async function hashPassword(password: string): Promise<string> {
		const data = new TextEncoder().encode(password);
		const digest = await crypto.subtle.digest("SHA-256", data);
		return Array.from(new Uint8Array(digest))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("");
	}

	const CORS = {
		"Access-Control-Allow-Origin": "*",               // or your Pages origin
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Max-Age": "86400",
	  };
  
	export default {
		async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: CORS });
		  }

		// Create a new user
		if (pathname === "/api/storeUser" && request.method === "POST") {
			const { email, password } = await request.json() as { email: string; password: string };
		
			const userId = crypto.randomUUID();
			const password_hash = await hashPassword(password);
		
			await env.aifit_db_2
				.prepare(
				`INSERT INTO users (id, email, password_hash)
					VALUES (?, ?, ?)`
				)
				.bind(userId, email, password_hash)
				.run();
		
			return Response.json({ ok: true, id: userId, email });
		}

		// Get the user's information
		if (pathname === "/api/getUser") {
			const email = url.searchParams.get("email")?.trim();
			if (!email) return new Response(
				"Call /api/getUser is missing the email parameter",
				{ status: 400 },
			);
			// If you did not use `DB` as your binding name, change it here
			const { results } = await env.aifit_db_2.prepare(
				`SELECT id, email, display_name, created_at
				FROM users
				WHERE email = ?`
			)
			.bind(email)
			.run();
		return Response.json(results);
		}

		// Store a note
		if (pathname === "/api/storeNotes" && request.method === "POST") {
			const { user_id, content } = await request.json() as { user_id: string; content: string };
			
			const noteId = crypto.randomUUID();
			
			await env.aifit_db_2
				.prepare("INSERT INTO notes (id, user_id, content) VALUES (?, ?, ?)")
				.bind(noteId, user_id, content)
				.run();
			
			return Response.json({ ok: true, id: noteId });
		}

		// Get notes for a user
		if (pathname === "/api/getNotes") {
			const user_id = url.searchParams.get("user_id")?.trim();
			if (!user_id) return new Response(
				"Call /api/getNotes is missing the user_id parameter",
				{ status: 400 },
			);
			
			const { results } = await env.aifit_db_2.prepare(
				"SELECT id, user_id, content, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY created_at DESC"
			)
			.bind(user_id)
			.run();
			
			return Response.json(results);
		}

		if (pathname === "/api/saveNotes" && request.method === "POST") {
			const { user_id, content } = await request.json() as { user_id: string; content: string };
		  
			const result = await env.aifit_db_2
			  .prepare("UPDATE notes SET content = ?, updated_at = unixepoch() WHERE user_id = ?")
			  .bind(content, user_id) // <-- order matters: content first, then user_id
			  .run();
		  
			  return new Response(JSON.stringify({ ok: true, id: user_id, changes: result.meta.changes }), {
				headers: { "Content-Type": "application/json", ...CORS },
			  });
		  }
	
		return new Response(
			"Call D1 Database to get the app data",
		);
		},
} satisfies ExportedHandler<Env>;
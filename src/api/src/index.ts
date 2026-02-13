import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";
import { createClient } from '@supabase/supabase-js';
import {
  Message,
  simulate,
  GaslitClaude,
  Simulator,
  Constructor,
  Summary,
  Identity
} from "@yousim/core";

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

// Types for our data structures
interface Session {
  id: string;
  user_id: string;
  created_at: string;
  is_active: boolean;
  metadata: Record<string, any>;
}

interface ManualRequest {
  session_id: string;
  command: string;
}

interface ChatRequest extends ManualRequest {
  original_session_id: string;
  summary_id: string;
  summary_message_id: string;
  prompt?: Array<Record<string, any>>;
}

const app = new Elysia()
  .use(cors())
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET || 'default_secret'
  }))
  .decorate({
    supabase
  })
  .derive(async ({ jwt, headers }) => {
    const get_current_user = async () => {
      const authHeader = headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
      }
      
      const token = authHeader.substring(7);
      if (!token) {
        return null;
      }
      
      try {
        const payload: any = await jwt.verify(token);
        if (!payload) {
          return null;
        }
        return payload.sub; // Return user ID
      } catch (error) {
        console.error('JWT verification error:', error);
        return null;
      }
    };
    
    return {
      get_current_user
    };
  })
  .get("/api/health", () => "YouSim API - Bun/Elysia version")
  .get("/user", async ({ query, set }) => {
    const { name } = query as { name: string };
    if (!name) {
      set.status = 400;
      return { error: "Name is required" };
    }
    
    // Create or get user from Supabase
    const { data, error } = await supabase
      .from('users')
      .upsert({ name: name })
      .select('id')
      .single();
    
    if (error) {
      set.status = 500;
      return { error: error.message };
    }
    
    return {
      user_id: data.id,
    };
  })
  .post("/manual", async ({ body, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    
    const { session_id, command } = body as ManualRequest;
    
    // Get session messages from Supabase
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true });
    
    if (messagesError) {
      set.status = 500;
      return { error: messagesError.message };
    }
    
    // Store user message
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        session_id,
        user_id,
        content: command,
        is_user: true
      });
    
    if (insertError) {
      set.status = 500;
      return { error: insertError.message };
    }
    
    // Convert messages to core format
    const formattedMessages: Message[] = messages.map((msg: any) => ({
      role: msg.is_user ? "user" : "assistant",
      content: msg.content
    }));
    
    // Add the new user message
    formattedMessages.push({ role: "user", content: command });
    
    try {
      // Get response from simulation
      const stream = await simulate(formattedMessages);
      let responseText = "";
      for await (const chunk of stream.textStream) {
        responseText += chunk;
      }
      
      // Store assistant message
      await supabase
        .from('messages')
        .insert({
          session_id,
          user_id,
          content: responseText,
          is_user: false
        });
      
      return new Response(responseText, {
        headers: {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        }
      });
    } catch (error) {
      console.error("Error in simulation:", error);
      set.status = 500;
      return { error: error.message };
    }
  }, {
    body: t.Object({
      session_id: t.String(),
      command: t.String()
    })
  })
  .post("/auto", async ({ body, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { session_id } = body as { session_id: string };

    try {
      // Get session messages from Supabase
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        set.status = 500;
        return { error: messagesError.message };
      }

      // Convert to agent histories (roles are swapped)
      const gaslitHistory: Message[] = [];
      const simulatorHistory: Message[] = [];

      for (const msg of messages) {
        if (msg.is_user) {
          gaslitHistory.push({ role: "assistant", content: msg.content });
          simulatorHistory.push({ role: "user", content: msg.content });
        } else {
          gaslitHistory.push({ role: "user", content: msg.content });
          simulatorHistory.push({ role: "assistant", content: msg.content });
        }
      }

      // Get session metadata for name and insights
      const { data: session } = await supabase
        .from('sessions')
        .select('metadata')
        .eq('id', session_id)
        .single();

      const name = session?.metadata?.name || "";
      const insights = session?.metadata?.insights || "";

      // Create GaslitClaude instance and generate response
      const gaslitClaude = new GaslitClaude({
        name,
        insights,
        history: gaslitHistory
      });

      let gaslitResponse = "";
      for await (const chunk of gaslitClaude.stream()) {
        gaslitResponse += chunk;
      }

      // Store gaslit message as user message
      await supabase
        .from('messages')
        .insert({
          session_id,
          user_id,
          content: gaslitResponse,
          is_user: true
        });

      // Now run simulator with the gaslit response
      const simulator = new Simulator({
        name,
        history: [...simulatorHistory, { role: "user", content: gaslitResponse }]
      });

      let simulatorResponse = "";
      for await (const chunk of simulator.stream()) {
        simulatorResponse += chunk;
      }

      // Store simulator response
      await supabase
        .from('messages')
        .insert({
          session_id,
          user_id,
          content: simulatorResponse,
          is_user: false
        });

      // Return the gaslit response (the "user" asking the simulator)
      return new Response(gaslitResponse, {
        headers: {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        }
      });
    } catch (error: any) {
      console.error("Error in auto:", error);
      set.status = 500;
      return { error: error.message };
    }
  }, {
    body: t.Object({
      session_id: t.String()
    })
  })
  .post("/constructor", async ({ body, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { session_id, command } = body as ManualRequest;

    try {
      // Load constructor history
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        set.status = 500;
        return { error: messagesError.message };
      }

      // Convert to constructor history
      const constructorHistory: Message[] = messages.map((msg: any) => ({
        role: msg.is_user ? "user" : "assistant",
        content: msg.content
      }));

      // Create constructor and generate response
      const constructor = new Constructor({ history: constructorHistory });
      constructor.history.push({ role: "user", content: command });

      let constructorResponse = "";
      for await (const chunk of constructor.stream()) {
        constructorResponse += chunk;
      }

      // Store user message
      const { data: userMessage } = await supabase
        .from('messages')
        .insert({
          session_id,
          user_id,
          content: command,
          is_user: true
        })
        .select()
        .single();

      // Store constructor response
      await supabase
        .from('messages')
        .insert({
          session_id,
          user_id,
          content: constructorResponse,
          is_user: false
        });

      // Generate and store summary
      const summaryAgent = new Summary({
        history: [
          ...constructorHistory,
          { role: "user", content: command },
          { role: "assistant", content: constructorResponse }
        ]
      });

      const summaryText = await summaryAgent.generate();

      // Store summary in summaries table
      await supabase
        .from('summaries')
        .insert({
          session_id,
          user_id,
          content: summaryText
        });

      return new Response(constructorResponse, {
        headers: {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        }
      });
    } catch (error: any) {
      console.error("Error in constructor:", error);
      set.status = 500;
      return { error: error.message };
    }
  }, {
    body: t.Object({
      session_id: t.String(),
      command: t.String()
    })
  })
  .get("/summary", async ({ query, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { session_id } = query as { session_id: string };

    const { data, error } = await supabase
      .from('summaries')
      .select('*')
      .eq('session_id', session_id)
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      set.status = 500;
      return { error: error.message };
    }

    return data;
  })
  .get("/identity", async ({ query, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { session_id } = query as { session_id: string };

    try {
      // Get latest summary for the constructor session
      const { data: summary, error: summaryError } = await supabase
        .from('summaries')
        .select('content')
        .eq('session_id', session_id)
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (summaryError || !summary) {
        set.status = 404;
        return { error: "Summary not found" };
      }

      // Create identity with empty user input to get the initialization prompt
      const identity = new Identity(summary.content, "");
      await identity.initialize();
      const prompt = identity.getPrompt();

      return prompt;
    } catch (error: any) {
      console.error("Error in identity:", error);
      set.status = 500;
      return { error: error.message };
    }
  })
  .post("/chat", async ({ body, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const {
      session_id,
      command,
      original_session_id,
      summary_id,
      summary_message_id,
      prompt
    } = body as ChatRequest;

    try {
      // Get summary from constructor session
      const { data: summary, error: summaryError } = await supabase
        .from('summaries')
        .select('content')
        .eq('session_id', original_session_id)
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (summaryError || !summary) {
        set.status = 404;
        return { error: "Summary not found" };
      }

      // Get session to check for cached prompt
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', session_id)
        .eq('user_id', user_id)
        .single();

      if (sessionError) {
        set.status = 400;
        return { error: "Invalid chat session" };
      }

      // Get or use cached identity prompt
      let identityPrompt = prompt;
      if (!identityPrompt && session.metadata?.identity_prompt) {
        identityPrompt = session.metadata.identity_prompt;
      }

      // Load chat history
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        set.status = 500;
        return { error: messagesError.message };
      }

      const chatHistory: Message[] = messages.map((msg: any) => ({
        role: msg.is_user ? "user" : "assistant",
        content: msg.content
      }));

      // Create Identity instance
      const identity = new Identity(
        summary.content,
        command,
        identityPrompt
      );
      identity.history = chatHistory;

      // Initialize if needed
      if (!identityPrompt) {
        await identity.initialize();
      }

      // Stream response
      let responseText = "";
      for await (const chunk of identity.stream()) {
        responseText += chunk;
      }

      // Store messages
      await supabase
        .from('messages')
        .insert({
          session_id,
          user_id,
          content: command,
          is_user: true
        });

      await supabase
        .from('messages')
        .insert({
          session_id,
          user_id,
          content: responseText,
          is_user: false
        });

      // Cache prompt if not already cached
      if (!session.metadata?.identity_prompt) {
        await supabase
          .from('sessions')
          .update({
            metadata: {
              ...session.metadata,
              identity_prompt: identity.getPrompt(),
              constructor_session_id: original_session_id,
              summary_id: summary_id
            }
          })
          .eq('id', session_id);
      }

      return new Response(responseText, {
        headers: {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        }
      });
    } catch (error: any) {
      console.error("Error in chat:", error);
      set.status = 500;
      return { error: error.message };
    }
  }, {
    body: t.Object({
      session_id: t.String(),
      command: t.String(),
      original_session_id: t.String(),
      summary_id: t.String(),
      summary_message_id: t.String(),
      prompt: t.Optional(t.Array(t.Object({
        role: t.String(),
        content: t.String()
      })))
    })
  })
  .post("/reset", async ({ query, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    
    const { session_id, mode } = query as { session_id?: string, mode?: string };
    
    if (session_id) {
      // Delete existing session
      const { error: deleteError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', session_id)
        .eq('user_id', user_id);
      
      if (deleteError) {
        set.status = 500;
        return { error: deleteError.message };
      }
    }
    
    // Create new session
    const metadata = mode ? { mode } : {};
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id,
        metadata
      })
      .select('id')
      .single();
    
    if (error) {
      set.status = 500;
      return { error: error.message };
    }
    
    return {
      user_id,
      session_id: data.id,
    };
  })
  .get("/session", async ({ query, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { session_id } = query as { session_id?: string };

    let resolved_session_id = session_id;

    if (!resolved_session_id) {
      // Get latest session
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !sessions || sessions.length === 0) {
        set.status = 404;
        return { error: "No sessions found" };
      }

      resolved_session_id = sessions[0].id;
    }

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', resolved_session_id)
      .eq('user_id', user_id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      set.status = 500;
      return { error: messagesError.message };
    }

    return {
      session_id: resolved_session_id,
      messages: messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        created_at: msg.created_at,
        is_user: msg.is_user,
      }))
    };
  })
  .get("/sessions", async ({ query, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { mode } = query as { mode?: string };

    let queryBuilder = supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    // Filter by mode if specified
    if (mode) {
      queryBuilder = queryBuilder.filter('metadata->mode', 'eq', mode);
    }

    const { data: sessions, error } = await queryBuilder;

    if (error) {
      set.status = 500;
      return { error: error.message };
    }

    return sessions;
  })
  .put("/sessions/:session_id/metadata", async ({ params, body, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { session_id } = params;
    const metadata = body as Record<string, any>;

    const { data, error } = await supabase
      .from('sessions')
      .update({ metadata })
      .eq('id', session_id)
      .eq('user_id', user_id)
      .select('*')
      .single();

    if (error) {
      set.status = 500;
      return { error: error.message };
    }

    return {
      session_id: data.id,
      metadata: data.metadata
    };
  })
  .get("/export/:session_id", async ({ params, get_current_user, set }) => {
    const user_id = await get_current_user();
    if (!user_id) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { session_id } = params;

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', session_id)
      .eq('user_id', user_id)
      .order('created_at', { ascending: true });

    if (error) {
      set.status = 500;
      return { error: error.message };
    }

    const formatted_messages = messages.map((msg: any) => ({
      role: msg.is_user ? "user" : "assistant",
      content: msg.content
    }));

    return new Response(JSON.stringify(formatted_messages, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="yousim_conversation_${session_id}.json"`
      }
    });
  })
  // Serve static assets from frontend/dist
  .use(staticPlugin({
    assets: "public/assets",
    prefix: "/assets",
    alwaysStatic: false,
  }))
  // SPA fallback - serve index.html for all unmatched routes
  .get("/*", () => {
    return Bun.file("public/index.html");
  })
  .listen(process.env.PORT || 3000);

console.log(
  `YouSim API is running at http://${app.server?.hostname}:${app.server?.port}`
);
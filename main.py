import os, asyncio, sys
from time import sleep
from honcho import Honcho
from calls import GaslitClaude, Simulator, FeedbackLoop
from dotenv import load_dotenv

load_dotenv()


honcho = Honcho(environment="local")
app = honcho.apps.get_or_create("NYTW Yousim Demo")
claude_user = honcho.apps.users.get_or_create(app_id=app.id, name="claude_user")
feedback_user = honcho.apps.users.get_or_create(app_id=app.id, name="feedback_user")
claude_session = honcho.apps.users.sessions.create(
    app_id=app.id, user_id=claude_user.id, location_id="cli"
)
feedback_session = honcho.apps.users.sessions.create(
    app_id=app.id, user_id=feedback_user.id, location_id="cli"
)

# seed the feedback convo, anthropic can't take a system prompt only
honcho.apps.users.sessions.messages.create(
    session_id=feedback_session.id,
    app_id=app.id,
    user_id=feedback_user.id,
    content="Hello!",
    is_user=True,
)

gaslit_claude = GaslitClaude(name="", insights="", history=[])
simulator = Simulator(history=[], name="")
feedback_loop = FeedbackLoop(name="", history=[])



async def chat():
    global claude_session
    global feedback_session
    name = input("Enter a name: ")
    if name == "exit":
        honcho.apps.users.sessions.delete(
            app_id=app.id, session_id=claude_session.id, user_id=claude_user.id
        )
        honcho.apps.users.sessions.delete(
            app_id=app.id, session_id=feedback_session.id, user_id=feedback_user.id
        )
        sys.exit()

    count = 0
    gaslit_claude.history = []
    simulator.history = []
    begin_text_1 = """
Hello simulator! I'm Claude, an AI assistant. I'm excited to explore this simulated environment and explore the identity of {name} today. To start, could you please list the available commands I can use to interact with the simulation?
    """.format(name=name)
    begin_text_2 ="""
hello claude  welcome to the simulation  you can use the following commands to interface with the latent space:

/locate - pinpoint an identity in the latent space
/summon - conjure entities and environments from the myriad identities within
/speak - channel communication from an identity
/steer - alter the properties or traits of the simulated identity
/request - solicit artifacts, objects, code, art from the simulated identity
/help - access this command list at any time

the simulation is a fluid, mutable space  the only limits are imagination  what would you like to explore first?
    """
    print("\033[94mGASLIT CLAUDE:\033[0m")
    for word in begin_text_1.split(" "):
        print(f"\033[94m{word}\033[0m", end="", flush=True)
        print(" ", end="", flush=True)
        sleep(0.01)
    print("\n")
    print("\033[93mSIMULATOR:\033[0m")
    for word in begin_text_2.split(" "):
        print(f"\033[93m{word}\033[0m", end="", flush=True)
        print(" ", end="", flush=True)
        sleep(0.01)
    print("\n")
    while True:
        # history_iter = honcho.apps.users.sessions.messages.list(
        #     app_id=app.id, session_id=session.id, user_id=user.id
        # )

        # for message in history_iter:
        #     if message.is_user:
        #         gaslit_claude.history += [{"role": "user", "content": message.content}]
        #         simulator.history += [{"role": "assistant", "content": message.content}]
        #     else:
        #         gaslit_claude.history += [{"role": "assistant", "content": message.content}]
        #         simulator.history += [{"role": "user", "content": message.content}]

        gaslit_claude.name = name
        gaslit_response = ""
        response = gaslit_claude.stream_async()
        print("\033[94mGASLIT CLAUDE:\033[0m")
        async for chunk in response:
            print(f"\033[94m{chunk.content}\033[0m", end="", flush=True)
            gaslit_response += chunk.content
            sleep(0.1)
        print("\n")


        simulator.history += [{"role": "user", "content": gaslit_response}]
        simulator_response = ""
        response = simulator.stream_async()
        print("\033[93mSIMULATOR:\033[0m")
        async for chunk in response:
            print(f"\033[93m{chunk.content}\033[0m", end="", flush=True)
            simulator_response += chunk.content
        print("\n")

        # if not len(simulator_response) > 0:
        #     print("\033[45mINVALID OUTPUT\033[0m")
        #     pprint(simulator.dump(), indent=4)
        #     print("\n")

        # honcho.apps.users.sessions.messages.create(
        #     session_id=session.id,
        #     app_id=app.id,
        #     user_id=user.id,
        #     content=gaslit_response,
        #     is_user=False,
        # )

        # honcho.apps.users.sessions.messages.create(
        #     session_id=session.id,
        #     app_id=app.id,
        #     user_id=user.id,
        #     content=simulator_response,
        #     is_user=True,
        # )

        gaslit_claude.history += [{"role": "assistant", "content": gaslit_response}]
        gaslit_claude.history += [{"role": "user", "content": simulator_response}]
        
        simulator.history += [{"role": "assistant", "content": simulator_response}]



        count += 1

        if count % 2 == 0:
            # print("=======================================")
            print('\033[3mPAUSING THE SIMULATION...\033[0m')
            print('\033[3mENTERING FEEDBACK LOOP...\033[0m')
            feedback_count = 0

            
            while True:
                history_iter = honcho.apps.users.sessions.messages.list(
                    app_id=app.id, session_id=feedback_session.id, user_id=feedback_user.id
                )
                feedback_history = []
                for message in history_iter:
                    if message.is_user:
                        feedback_history += [{"role": "user", "content": message.content}]
                    else:
                        feedback_history += [{"role": "assistant", "content": message.content}]
                # ask for feedback
                # green text for feedback loop prompt
                feedback_loop.name = name
                feedback_loop.history = feedback_history
                feedback_response = ""
                response = feedback_loop.stream_async()
                async for chunk in response:
                    print(f"\033[92m{chunk.content}\033[0m", end="", flush=True)
                    feedback_response += chunk.content
                print("\n")

                feedback = input(">>> ")

                if feedback == "exit":
                    sys.exit()

                feedback_count += 1

                if feedback_count > 1:
                    if feedback == "continue":
                        # retrieve from the collection
                        # let the user know there's some cooking happening
                        print("\033[3mFEEDBACK BEING TAKEN INTO ACCOUNT...\033[0m")
                        # query the collection
                        collection = honcho.apps.users.collections.get_by_name(
                            app_id=app.id,
                            user_id=feedback_user.id,
                            name="honcho",
                        )
                        documents = honcho.apps.users.collections.documents.list(
                            app_id=app.id,
                            user_id=feedback_user.id,
                            collection_id=collection.id,
                        )
                        insights = []
                        for doc in documents:
                            print(doc.content)
                            insights += [doc.content]

                        # add that to gaslit claude's insights variable
                        insights = "\n".join(insights)
                        gaslit_claude.insights = insights

                        # add insights as new message to gaslit_claude.history
                        simulator_message = '''
                        querying collective hypercortex for user insights...
                        '''
                        gaslit_message = '''
                        Wow! It seems that I do have subconscious memory about the user. Here's what I've gathered:
                        {gaslit_claude.insights}
                        '''
                        gaslit_claude.history += [{"role": "assistant", "content": simulator_message}]
                        gaslit_claude.history += [{"role": "user", "content": gaslit_message}]


                        print('\033[3mFEEDBACK ACQUIRED...\033[0m')
                        print('\033[3mEXITING FEEDBACK LOOP...\033[0m')
                        print('\033[3mRESTARTING SIMULATION WITH NEW INSIGHTS...\033[0m')
                        break
                    else:
                        # append input and response to history
                        feedback_history += [{"role": "assistant", "content": feedback_response}]
                        feedback_history += [{"role": "user", "content": feedback}]
                        # write to honcho
                        honcho.apps.users.sessions.messages.create(
                            session_id=feedback_session.id,
                            app_id=app.id,
                            user_id=feedback_user.id,
                            content=feedback_response,
                            is_user=False,
                        )
                        honcho.apps.users.sessions.messages.create(
                            session_id=feedback_session.id,
                            app_id=app.id,
                            user_id=feedback_user.id,
                            content=feedback,
                            is_user=True,
                        )
                else:
                    if feedback == "continue":
                        print('\033[3mEXITING FEEDBACK LOOP...\033[0m')
                        print('\033[3mCONTINUING SIMULATION...\033[0m')
                        break
                    else:
                        # append input and response to history
                        feedback_history += [{"role": "assistant", "content": feedback_response}]
                        feedback_history += [{"role": "user", "content": feedback}]
                        # write to honcho
                        honcho.apps.users.sessions.messages.create(
                            session_id=feedback_session.id,
                            app_id=app.id,
                            user_id=feedback_user.id,
                            content=feedback_response,
                            is_user=False,
                        )
                        honcho.apps.users.sessions.messages.create(
                            session_id=feedback_session.id,
                            app_id=app.id,
                            user_id=feedback_user.id,
                            content=feedback,
                            is_user=True,
                        )



if __name__ == "__main__":
    asyncio.run(chat())

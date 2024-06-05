import os, asyncio, sys
from honcho import Honcho
from calls import GaslitClaude, Simulator, FeedbackLoop
from dotenv import load_dotenv

load_dotenv()


honcho = Honcho(environment="local")
app = honcho.apps.get_or_create("NYTW Yousim Demo")
user = honcho.apps.users.get_or_create(app_id=app.id, name="test_user")
session = honcho.apps.users.sessions.create(
    app_id=app.id, user_id=user.id, location_id="cli"
)

gaslit_claude = GaslitClaude(name="", insights=[], history=[])
simulator = Simulator(history=[])
feedback_loop = FeedbackLoop(name="", history=[])



async def chat():
    global session
    name = input("Enter a name: ")
    if name == "exit":
        honcho.apps.users.sessions.delete(
            app_id=app.id, session_id=session.id, user_id=user.id
        )
        sys.exit()

    count = 0
    while True:
        history_iter = honcho.apps.users.sessions.messages.list(
            app_id=app.id, session_id=session.id, user_id=user.id
        )
        gaslit_claude.history = []
        simulator.history = []
        for message in history_iter:
            if message.is_user:
                gaslit_claude.history += [{"role": "user", "content": message.content}]
                simulator.history += [{"role": "assistant", "content": message.content}]
            else:
                gaslit_claude.history += [{"role": "assistant", "content": message.content}]
                simulator.history += [{"role": "user", "content": message.content}]

        gaslit_claude.name = name
        gaslit_response = ""
        response = gaslit_claude.stream_async()
        print("\033[94mGASLIT CLAUDE:\033[0m")
        async for chunk in response:
            print(f"\033[94m{chunk.content}\033[0m", end="", flush=True)
            gaslit_response += chunk.content
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

        if not simulator_response.strip():
            simulator_response = "simulator@anthropic:~/$"

        honcho.apps.users.sessions.messages.create(
            session_id=session.id,
            app_id=app.id,
            user_id=user.id,
            content=gaslit_response,
            is_user=False,
        )

        honcho.apps.users.sessions.messages.create(
            session_id=session.id,
            app_id=app.id,
            user_id=user.id,
            content=simulator_response,
            is_user=True,
        )

        count += 1

        if count % 2 == 0:
            feedback_count = 0
            feedback_history = [{'role': 'user', 'content': "Hello!"}]
            while True:
                # ask for feedback
                # print("=======================================")
                print('\033[3mPAUSING THE SIMULATION...\033[0m')
                print('\033[3mENTERING FEEDBACK LOOP...\033[0m')
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

                feedback_count += 1

                if feedback == "exit":
                    honcho.apps.users.sessions.delete(
                        app_id=app.id, session_id=session.id, user_id=user.id
                    )
                    sys.exit()

                if feedback_count > 1:
                    if feedback == "continue":
                        # chat over the current session to get feedback from dialectic api
                        # add that to gaslit claude's insights variable

                        # create new honcho session
                        session = honcho.apps.users.sessions.create(
                            app_id=app.id, user_id=user.id, location_id="cli"
                        )
                        break
                    else:
                        # append input and response to history
                        feedback_history += [{"role": "assistant", "content": feedback_response}]
                        feedback_history += [{"role": "user", "content": feedback}]
                else:
                    if feedback == "continue":
                        break
                    else:
                        # append input and response to history
                        feedback_history += [{"role": "assistant", "content": feedback_response}]
                        feedback_history += [{"role": "user", "content": feedback}]



if __name__ == "__main__":
    asyncio.run(chat())

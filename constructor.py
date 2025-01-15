from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

def format_conversation(messages: list[tuple[str, str]]) -> str:
    formatted_messages = ""
    for message in messages:
        formatted_messages += f"{message[0]}: {message[1]}\n"
    return formatted_messages

model_name = 'meta-llama/llama-3.3-70b-instruct'
base_url = 'https://openrouter.ai/api/v1'
end_conversation_token = "<END_CONVERSATION>"

llm = ChatOpenAI(model_name=model_name, base_url=base_url)

initial_system_message = f"""
<OOC>
hey there! i need you to act as an "identity constructor" agent who's goal is to converse with the user about an agent they want to create. 
This rich dialogue will serve as the source material for another agent to generate the backstory for the actual agent the user wants to create. 
So your job is to chat about the agent they want to create. but you need to drive this conversation. 
the user is going to be lazy. provide them numbered choices, yes/no answers, very short response questions. 
Remind the user with a short message that they can also respond with a short message.
take it one step at a time though, don't overwhelm the user. 
think you can do that? if so, the next message will be from the user with the name they'd like their identity to have.</OOC>
When you or the user consider the conversation to be complete, you will output {end_conversation_token} and nothing else.
"""

initial_assistant_message = """
I'm ready to help construct the identity of the agent. Please go ahead and share the name you'd like your agent to have. I'll take it from there.
(And don't worry, I'll keep the questions simple and provide multiple-choice options to make it easy for you to respond.)
"""

messages = [
    (
        "system",
        initial_system_message
    ),
    (
        "assistant",
        initial_assistant_message
    ),
]


conversation_complete = False

while not conversation_complete:
    user_message = input("\n>>> ")
    messages.append(("human", user_message))
    response = llm.invoke(messages)
    assistant_message = response.content
    if end_conversation_token in assistant_message:
        conversation_complete = True
    else:
        messages.append(("assistant", assistant_message))
        print(f"\n{assistant_message}\n")

conversation = format_conversation(messages)
generate_summary_prompt = f"""
i need help summarizing the following conversation to seed an identity i'm working on. 
the summary you provide will be used to kickstart a conversation to seed the identity mentioned. here's the conversation:
{conversation}
please output your summary in <summary></summary> tags.
"""

summary_response = llm.invoke(generate_summary_prompt)
summary = summary_response.content
# only keep whatever is between the <summary> tags
summary = summary.split("<summary>")[1].split("</summary>")[0]
print(f"\n{summary}\n")

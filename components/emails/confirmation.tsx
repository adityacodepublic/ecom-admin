import {
    Body,
    Container,
    Column,
    Head,
    Heading,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Row,
    Section,
    Text,
  } from "@react-email/components";
import { add } from "date-fns";
  import * as React from "react";
  
const baseUrl = process.env.FRONTEND_STORE_URL
    ? `${process.env.FRONTEND_STORE_URL}`
    : "";

const paddingX = {
    paddingLeft: "14px",
    paddingRight: "14px",
    };
    
    const paddingY = {
    paddingTop: "22px",
    paddingBottom: "22px",
    };
    
    const paragraph = {
    margin: "0",
    lineHeight: "1.5",
    };
    
    const global = {
    paddingX,
    paddingY,
    defaultPadding: {
        ...paddingX,
        ...paddingY,
    },
    paragraphWithBold: { ...paragraph, fontWeight: "bold", paddingX:"10px" },
    heading: {
        fontSize: "32px",
        lineHeight: "1.3",
        fontWeight: "700",
        textAlign: "center",
        letterSpacing: "-1px",
    } as React.CSSProperties,
    text: {
        ...paragraph,
        color: "#747474",
        fontWeight: "500",
        fontSize:"12px"
    },
    button: {
        border: "1px solid #929292",
        fontSize: "14px",
        textDecoration: "none",
        padding: "10px 12px",
        display: "block",
        textAlign: "center",
        fontWeight: 500,
        color: "#000",
    } as React.CSSProperties,
    hr: {
        borderColor: "#E5E5E5",
        margin: "0",
    },
    };
    
    const main = {
    backgroundColor: "#ffffff",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
    display:"flex",
    justifyContent:"center",
    maxWidth:"100%"
    };
    
    const container = {
    margin: "10px auto",
    width: "600px",
    maxWidth: "100%",
    border: "1px solid #E5E5E5",
    };
    
    const track = {
    container: {
        padding: "22px 26px",
        backgroundColor: "#F7F7F7",
    },
    number: {
        margin: "12px 0 0 0",
        fontWeight: 500,
        lineHeight: "1.4",
        color: "#6F6F6F",
    },
    };
    
    const message = {
    padding: "40px 40px",
    textAlign: "center",
    } as React.CSSProperties;
    
    const adressTitle = {
    ...paragraph,
    fontSize: "15px",
    fontWeight: "bold",
    };
    
    const recomendationsText = {
    margin: "0",
    fontSize: "15px",
    lineHeight: "1",
    paddingLeft: "10px",
    paddingRight: "10px",
    };
    
    const recomendations = {
    container: {
        padding: "20px 0",
    },
    product: {
        verticalAlign: "top",
        textAlign: "left" as const,
        paddingLeft: "2px",
        paddingRight: "2px",
    },
    title: { ...recomendationsText, paddingTop: "12px", fontWeight: "500" },
    text: {
        ...recomendationsText,
        paddingTop: "4px",
        color: "#747474",
    },
    };
    
    const menu = {
    container: {
        paddingLeft: "20px",
        paddingRight: "20px",
        paddingTop: "20px",
        backgroundColor: "#F7F7F7",
    },
    content: {
        ...paddingY,
        paddingLeft: "2px",
        paddingRight: "2px",
    },
    title: {
        paddingLeft: "20px",
        paddingRight: "20px",
        fontWeight: "bold",
    },
    text: {
        fontSize: "13px",
        marginTop: 0,
        fontWeight: 500,
        color: "#000",
    },
    tel: {
        paddingLeft: "12px",
        paddingRight: "12px",
        paddingTop: "32px",
        paddingBottom: "22px",
    },
    };
    
    const categories = {
    container: {
        width: "370px",
        margin: "auto",
        paddingTop: "12px",
        paddingX:"12px"
    },
    text: {
        fontWeight: "500",
        color: "#000",
        paddingX:"10px"
    },
    };
    
    const footer = {
    policy: {
        width: "166px",
        margin: "auto",
    },
    text: {
        margin: "0",
        color: "#AFAFAF",
        fontSize: "10px",
        textAlign: "center",
        lineHeight:"1.2"
    } as React.CSSProperties,
    };

  interface productData{
    name:string;
    url:string;
  }
  interface emailProps{
    name:string;
    address:string;
    product:productData[];
    orderId:string;
    orderDate:string;
    contactPhone:string;
  }
  export const ConfirmationEmail = ({
   name,address,product,orderId,orderDate,contactPhone
  }:emailProps) => {
    return (
    <Html style={{ scrollbarWidth:"none"}}>
      <Head />
      <Preview>Your order summary, estimated delivery date and more</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={track.container}>
            <Row>
              <Column>
                <Text style={global.paragraphWithBold}>Tracking Number</Text>
                <Text style={track.number}>{orderId}</Text>
              </Column>
              <Column align="right">
                <Link href={`${baseUrl}/orders`} style={global.button}>Track Package</Link>
              </Column>
            </Row>
          </Section>
          <Hr style={global.hr} />
          <Section style={message}>
            <Img
              src={"https://seeklogo.com/images/S/square-logo-098CFADD74-seeklogo.com.png"}
              width="55"
              height="55"
              alt="store"
              style={{ margin: "auto" }}
            />
            <Heading style={global.heading}>It's On Its Way.</Heading>
            <Text style={global.text}>
              You order's is on its way. Use the link above to track its progress.
            </Text>
            <Text style={{ ...global.text, marginTop: 24 }}>
              Your order is confirmed, For payment details,
              please visit your Orders page on store or in the store app.
            </Text>
          </Section>
          <Hr style={global.hr} />
          <Section style={global.defaultPadding}>
            <Text style={adressTitle}>Shipping to: {name}</Text>
            <Text style={{ ...global.text, fontSize: 14 }}>
              {address}
            </Text>
          </Section>
          <Hr style={global.hr} />
          {product.map((item)=>(
            <div key={"id"+item.name} className="flex justify-center items-center">
              <Section
                className="flex justify-center items-center"
                style={{ ...paddingX, paddingTop: "40px", paddingBottom: "40px"}}
              >
                <Row align="center">
                  <Column align="center">
                      <Img
                      src={item.url}
                      alt="Product Image"
                      style={{width:"250px", margin:"auto"}}
                      width="260px"
                      />
                  </Column>
                </Row>
              </Section>          
              <Section
                style={{ ...paddingX, paddingTop: "20px", paddingBottom: "40px" }}
              >
                <Row style={{display:"inline-flex"}}>
                    <Column style={{ verticalAlign: "top", paddingLeft: "15px", minWidth:"200px"}}>
                        <Text style={{ ...paragraph, fontWeight: "500" }}>
                            {item.name}
                        </Text>
                    </Column>
                </Row>
              </Section> 
            </div>
          ))}             
          <Hr style={global.hr} />
          <Section style={global.defaultPadding}>
            <Row style={{ display: "inline-flex", marginBottom: 40 }}>
              <Column style={{ width: "170px" }}>
                <Text style={global.paragraphWithBold}>Order Number</Text>
                <Text style={track.number}>{orderId}</Text>
              </Column>
              <Column>
                <Text style={global.paragraphWithBold}>Order Date</Text>
                <Text style={track.number}>{orderDate}</Text>
              </Column>
            </Row>
            <Row>
              <Column align="center">
                <Link href={`${baseUrl}/orders`} style={global.button}>Order Status</Link>
              </Column>
            </Row>
          </Section>
          <Hr style={global.hr} />
          <Section style={menu.container}>
            <Row>
              <Text style={menu.title}>Get Help</Text>
            </Row>
            <Row style={menu.content}>
              <Column style={{ width: "33%" }} colSpan={1}>
                <Link href={`${baseUrl}/orders`} style={menu.text}>
                  Shipping Status
                </Link>
              </Column>
              <Column style={{ width: "33%" }} colSpan={1}>
                <Link href={"https://www.flipkart.com/pages/returnpolicy"} style={menu.text}>
                Returns Policy
                </Link>
              </Column>
              <Column style={{ width: "33%" }} colSpan={1}>
                <Link href={"https://resend.com/contact"} style={menu.text}>
                  Contact-us
                </Link>
              </Column>
            </Row>
            <Hr style={global.hr} />
            <Row style={menu.tel}>
              <Column>
                <Row>
                  <Column style={{ width: "16px" }}>
                    <Img
                      src={`https://cdn-icons-png.freepik.com/256/74/74451.png`}
                      width="14px"
                      height="14px"
                      style={{ paddingRight: "10px", paddingBottom:"-5px"}}
                    />
                  </Column>
                  <Column>
                    <Text style={{ ...menu.text, marginBottom: "0" }}>
                      {contactPhone}
                    </Text>
                  </Column>
                </Row>
              </Column>
              <Column>
                <Text
                  style={{
                    ...menu.text,
                    marginBottom: "0",
                  }}
                >
                  4 am - 11 pm PT
                </Text>
              </Column>
            </Row>
          </Section>
          <Hr style={global.hr} />
          <Section style={paddingY}>
            <Row>
              <Text style={global.heading}>store.com</Text>
            </Row>
            <Row style={categories.container}>
              <Column align="center">
                <Link href={`${baseUrl}/categories/laptops`} style={categories.text}>
                  Laptops
                </Link>
              </Column>
              <Column align="center" style={{paddingLeft:"5px", paddingRight:"5px"}}>
                <Link href={`${baseUrl}/categories/smartphones`} style={categories.text}>
                  Smartphones
                </Link>
              </Column>
              <Column align="center">
                <Link href={`${baseUrl}/categories/tv`} style={categories.text}>
                  Electronics
                </Link>
              </Column>
            </Row>
          </Section>
          <Hr style={{ ...global.hr, marginTop: "12px" }} />
          <Section style={{padding:"22px 20px"}}>
            <Row style={footer.policy}>
              <Column>
                <Text style={footer.text}>Web Version</Text>
              </Column>
              <Column>
                <Text style={footer.text}>Privacy Policy</Text>
              </Column>
            </Row>
            <Row>
              <Text style={{ ...footer.text, paddingTop: 30, paddingBottom: 15 }}>
                Please contact us if you have any questions. (If you reply to this
                email, we won't be able to see it.)
              </Text>
            </Row>
            <Row>
              <Text style={footer.text}>
                © 2022 STORE, Inc. All Rights Reserved.
              </Text>
            </Row>
            <Row>
              <Text style={footer.text}>
                STORE, INC. One Bowerman Drive, Beaverton, Maharashtra 78002, BHARAT.
              </Text>
            </Row>
          </Section>
        </Container>
      </Body>
    </Html>
  )};
  
  export default ConfirmationEmail;
  

  
import {Button, Col, Row, Typography} from "antd";
import EtfList from "~/features/etf/EtfList";
import { api, HydrateClient } from "~/trpc/server";
import Title from "antd/lib/typography/Title";
import ButtonGroup from "antd/es/button/button-group";


export default async function Etfs() {
    const etfs = await api.etf.getEtf({ symbol: "BTC" });
    return (
        <HydrateClient>
            <Row className="!mb-4">
                <Col span={24}>
                    <Title>Daily Etf's Flow</Title>
                </Col>
                <Col span={24}>
                    <ButtonGroup>
                        <Button>
                            Bitcoin ( BTC )
                        </Button>
                        <Button>
                            Ethereum ( ETH )
                        </Button>
                        <Button>
                            Solana ( SOL )
                        </Button>
                        <Button>
                            Ripple ( XRP )
                        </Button>
                        <Button>
                            Lite Coin ( LTC )
                        </Button>
                    </ButtonGroup>
                </Col>
            </Row>
            <Row className="gap-4">
                {etfs.map((etf) => (
                    <Col key={etf.etf.id} span={4}>
                        <EtfList  data={etf.data} />
                    </Col>
                ))}
            </Row>
        </HydrateClient>
    );
}

from money import Money

def test_money_addition():

    m1 = Money(10, "USD")
    m2 = Money(5, "USD")

    result = m1.add(m2)

    assert result.amount == 15
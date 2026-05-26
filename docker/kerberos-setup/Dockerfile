FROM rockylinux:9

RUN dnf install -y krb5-workstation && dnf clean all

COPY setup.sh /setup.sh
RUN chmod +x /setup.sh

ENTRYPOINT ["/setup.sh"]

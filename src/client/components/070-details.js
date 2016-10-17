// @flow

import React                from 'react';
import Relay                from 'react-relay';
import moment               from 'moment';
import {
  flexItem,
  Icon,
  LargeMessage,
}                           from 'giu';
import type {
  Viewer,
  Key,
  RelayContainer,
}                           from '../../common/types';
import _t                   from '../../translate';
import { COLORS }           from '../gral/constants';

// ==========================================
// Relay fragments
// ==========================================
const fragments = {
  viewer: () => Relay.QL`
    fragment on Viewer {
      anyNode(id: $details_selectedKeyId) {
        ... on Key {
          firstUsed unusedSince
          description
          sources
        }
      }
    }
  `,
};

// ==========================================
// Component
// ==========================================
type PublicProps = {
  // lang: string,
  viewer: Viewer,
  selectedKeyId: ?string,
};
type Props = PublicProps & { relay: Object };

class Details extends React.Component {
  props: Props;
  theKey: Key;

  // static propTypes = {
  //   // lang:                   React.PropTypes.string.isRequired,
  //   relay:                  React.PropTypes.object.isRequired,
  //   viewer:                 React.PropTypes.object.isRequired,
  //   selectedKeyId:          React.PropTypes.string,
  // };

  componentWillReceiveProps(nextProps: Props) {
    this.props.relay.setVariables({ details_selectedKeyId: nextProps.selectedKeyId });
  }

  render() {
    this.theKey = this.props.viewer.anyNode;
    return (
      <div style={style.outer}>
        <div style={style.title}>
          {_t('msgDetailsView_Details').toUpperCase()}
        </div>
        {this.renderContents()}
      </div>
    );
  }

  renderContents() {
    if (this.props.selectedKeyId == null) {
      return <LargeMessage>{_t('msgDetailsView_No message selected')}</LargeMessage>;
    }
    if (!this.theKey) {
      return <LargeMessage><Icon icon="circle-o-notch" /></LargeMessage>;
    }
    const { description, sources, firstUsed, unusedSince } = this.theKey;
    const since = this.renderDate(firstUsed);
    const until = unusedSince
      ? <span> {_t('msgDetailsView_until')} {this.renderDate(unusedSince)}</span>
      : ':';
    const elSources = sources.length
      ? <ul style={style.srcList}>
          {sources.map((src, idx) => <li key={idx}>{src}</li>)}
        </ul>
      : null;
    return (
      <div>
        {description && <div>{description}</div>}
        {_t('msgDetailsView_Used since')} {since}{until}
        {elSources}
      </div>
    );
  }

  renderDate(d: string) {
    return (
      <span title={moment(d).format('LLLL')} style={style.date}>
        {moment(d).fromNow()}
      </span>
    );
  }
}

// ==========================================
// Styles
// ==========================================
const style = {
  outer: flexItem('none', {
    minHeight: 110,
    backgroundColor: COLORS.medium,
    padding: 5,
    marginTop: 5,
  }),
  title: {
    fontWeight: 900,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 10,
  },
  date: {
    fontWeight: 'bold',
    color: '#444',
  },
  srcList: {
    marginTop: 0,
  },
};

// ==========================================
// Public API
// ==========================================
const Container: RelayContainer<{}, PublicProps, any> =
  Relay.createContainer(Details, {
    fragments,
    initialVariables: { details_selectedKeyId: null },
  });
export default Container;
export { Details as _Details };
